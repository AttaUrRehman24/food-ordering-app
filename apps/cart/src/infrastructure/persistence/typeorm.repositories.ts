import { DataSource, EntityManager } from 'typeorm';
import type { CartItem } from '../../domain/cart';
import type { CartSnapshotRepository } from '../../application/ports';
import { Cart } from './entities/cart.entity';

export class TypeOrmCartSnapshotRepository implements CartSnapshotRepository {
  constructor(private readonly em: EntityManager) {}

  private repo() {
    return this.em.getRepository(Cart);
  }

  async upsert(userId: string, items: CartItem[], total: string): Promise<void> {
    await this.repo().save({
      userId,
      items,
      total,
      updatedAt: new Date(),
    });
  }

  async delete(userId: string): Promise<void> {
    await this.repo().delete({ userId });
  }
}

export function createCartSnapshotRepository(
  dataSource: DataSource,
): TypeOrmCartSnapshotRepository {
  return new TypeOrmCartSnapshotRepository(dataSource.manager);
}
