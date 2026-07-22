import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { OrderStatusHistory } from './order-status-history.entity';
import { OrderOutbox } from './order-outbox.entity';
import { OrderIdempotency } from './order-idempotency.entity';

export const orderEntities = [
  Order,
  OrderItem,
  OrderStatusHistory,
  OrderOutbox,
  OrderIdempotency,
];

export { Order, OrderItem, OrderStatusHistory, OrderOutbox, OrderIdempotency };
