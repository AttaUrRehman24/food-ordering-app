import { randomUUID } from 'crypto';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { OrderStatus, PaymentType } from '@food-ordering/domain';
import { KafkaTopics } from '@food-ordering/kafka';
import { NotFoundError, UnprocessableError } from '../../domain/errors';
import type {
  OrderDto,
  OrderSummaryDto,
  PlaceOrderResult,
} from '../../domain/types';
import type { OrderRepository, PricedLine } from '../../application/ports';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { OrderOutbox } from './entities/order-outbox.entity';
import { OrderIdempotency } from './entities/order-idempotency.entity';

function mapOrder(order: Order): OrderDto {
  return {
    id: order.id,
    userId: order.userId,
    total: String(order.total),
    paymentType: order.paymentType,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    softDeleted: order.softDeleted,
    items: (order.items ?? []).map((i) => ({
      id: i.id,
      variantId: i.variantId,
      productNameSnapshot: i.productNameSnapshot,
      variantLabelSnapshot: i.variantLabelSnapshot,
      unitPriceSnapshot: String(i.unitPriceSnapshot),
      quantity: i.quantity,
    })),
    statusHistory: (order.statusHistory ?? []).map((h) => ({
      id: h.id,
      status: h.status,
      at: h.at.toISOString(),
    })),
  };
}

export class TypeOrmOrderRepository implements OrderRepository {
  constructor(private readonly dataSource: DataSource) {}

  private em(): EntityManager {
    return this.dataSource.manager;
  }

  async findIdempotency(key: string): Promise<PlaceOrderResult | null> {
    const row = await this.em().getRepository(OrderIdempotency).findOneBy({ key });
    if (!row) {
      return null;
    }
    return row.responseBody as unknown as PlaceOrderResult;
  }

  async placeOrder(input: {
    userId: string;
    paymentType: PaymentType;
    idempotencyKey: string;
    lines: PricedLine[];
    total: string;
  }): Promise<PlaceOrderResult> {
    return this.dataSource.transaction(async (em) => {
      const existing = await em.getRepository(OrderIdempotency).findOneBy({
        key: input.idempotencyKey,
      });
      if (existing) {
        return existing.responseBody as unknown as PlaceOrderResult;
      }

      const orderId = randomUUID();
      const createdAt = new Date();

      const order = em.getRepository(Order).create({
        id: orderId,
        createdAt,
        userId: input.userId,
        total: input.total,
        paymentType: input.paymentType,
        status: OrderStatus.Pending,
        softDeleted: false,
        items: input.lines.map((line) =>
          em.getRepository(OrderItem).create({
            orderId,
            orderCreatedAt: createdAt,
            variantId: line.variantId,
            productNameSnapshot: line.productNameSnapshot,
            variantLabelSnapshot: line.variantLabelSnapshot,
            unitPriceSnapshot: line.unitPriceSnapshot,
            quantity: line.quantity,
          }),
        ),
        statusHistory: [
          em.getRepository(OrderStatusHistory).create({
            orderId,
            orderCreatedAt: createdAt,
            status: OrderStatus.Pending,
            at: createdAt,
          }),
        ],
      });

      await em.getRepository(Order).save(order);

      await em.getRepository(OrderOutbox).save(
        em.getRepository(OrderOutbox).create({
          event: KafkaTopics.OrderCreated,
          payload: {
            orderId,
            userId: input.userId,
            total: input.total,
            paymentType: input.paymentType,
            items: input.lines,
          },
          publishedAt: null,
        }),
      );

      const response: PlaceOrderResult = {
        orderId,
        status: OrderStatus.Pending,
        total: input.total,
      };

      await em.getRepository(OrderIdempotency).save(
        em.getRepository(OrderIdempotency).create({
          key: input.idempotencyKey,
          orderId,
          responseBody: response as unknown as Record<string, unknown>,
        }),
      );

      return response;
    });
  }

  async findById(orderId: string): Promise<OrderDto | null> {
    const order = await this.em().getRepository(Order).findOne({
      where: { id: orderId },
      relations: { items: true, statusHistory: true },
    });
    return order ? mapOrder(order) : null;
  }

  async listByUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: OrderSummaryDto[]; total: number }> {
    const repo = this.em().getRepository(Order);
    const [rows, total] = await repo.findAndCount({
      where: { userId, softDeleted: false },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: { items: true },
    });
    return {
      total,
      items: rows.map((o) => ({
        id: o.id,
        userId: o.userId,
        total: String(o.total),
        status: o.status,
        paymentType: o.paymentType,
        createdAt: o.createdAt.toISOString(),
        itemCount: (o.items ?? []).reduce((n, i) => n + i.quantity, 0),
      })),
    };
  }

  async listAll(
    page: number,
    limit: number,
  ): Promise<{ items: OrderSummaryDto[]; total: number }> {
    const repo = this.em().getRepository(Order);
    const [rows, total] = await repo.findAndCount({
      where: { softDeleted: false },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: { items: true },
    });
    return {
      total,
      items: rows.map((o) => ({
        id: o.id,
        userId: o.userId,
        total: String(o.total),
        status: o.status,
        paymentType: o.paymentType,
        createdAt: o.createdAt.toISOString(),
        itemCount: (o.items ?? []).reduce((n, i) => n + i.quantity, 0),
      })),
    };
  }

  async cancel(input: { orderId: string; softDelete: boolean }): Promise<OrderDto> {
    return this.dataSource.transaction(async (em) => {
      const order = await em.getRepository(Order).findOne({
        where: { id: input.orderId },
        relations: { items: true, statusHistory: true },
      });
      if (!order) {
        throw new NotFoundError('Order not found');
      }
      if (order.status !== OrderStatus.Pending && order.status !== OrderStatus.Cancelled) {
        // admin may still cancel non-pending per Q3 — allow admin soft-delete path
        if (!input.softDelete) {
          throw new UnprocessableError('Order already processed');
        }
      }

      order.status = OrderStatus.Cancelled;
      if (input.softDelete) {
        order.softDeleted = true;
      }
      const history = em.getRepository(OrderStatusHistory).create({
        orderId: order.id,
        orderCreatedAt: order.createdAt,
        status: OrderStatus.Cancelled,
        at: new Date(),
      });
      order.statusHistory = [...(order.statusHistory ?? []), history];
      const saved = await em.getRepository(Order).save(order);
      return mapOrder(saved);
    });
  }

  async markStatus(input: {
    orderId: string;
    status: OrderStatus.Paid | OrderStatus.Failed;
  }): Promise<OrderDto> {
    return this.dataSource.transaction(async (em) => {
      const order = await em.getRepository(Order).findOne({
        where: { id: input.orderId },
        relations: { items: true, statusHistory: true },
      });
      if (!order) {
        throw new NotFoundError('Order not found');
      }
      if (order.status !== OrderStatus.Pending) {
        return mapOrder(order);
      }
      order.status = input.status;
      const history = em.getRepository(OrderStatusHistory).create({
        orderId: order.id,
        orderCreatedAt: order.createdAt,
        status: input.status,
        at: new Date(),
      });
      order.statusHistory = [...(order.statusHistory ?? []), history];

      const saved = await em.getRepository(Order).save(order);
      return mapOrder(saved);
    });
  }

  async claimOutboxBatch(
    limit: number,
  ): Promise<Array<{ id: string; event: string; payload: Record<string, unknown> }>> {
    const rows = await this.em().getRepository(OrderOutbox).find({
      where: { publishedAt: IsNull() },
      order: { createdAt: 'ASC' },
      take: limit,
    });
    return rows.map((r) => ({ id: r.id, event: r.event, payload: r.payload }));
  }

  async markOutboxPublished(ids: string[]): Promise<void> {
    if (!ids.length) {
      return;
    }
    await this.em()
      .getRepository(OrderOutbox)
      .createQueryBuilder()
      .update(OrderOutbox)
      .set({ publishedAt: new Date() })
      .whereInIds(ids)
      .execute();
  }
}
