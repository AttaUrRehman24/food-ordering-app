import { DefaultNamingStrategy, type NamingStrategyInterface } from 'typeorm';
import { snakeCase } from 'typeorm/util/StringUtils';

/**
 * Maps `@Entity()` class names to  Documentation plural/snake table names
 * and property names to snake_case columns — so entities can use:
 *   @Entity()
 *   export class User extends BaseEntity { @Column() email!: string }
 */
const TABLE_NAMES: Record<string, string> = {
  User: 'users',
  Credential: 'credentials',
  Role: 'roles',
  Session: 'sessions',
  RefreshToken: 'refresh_tokens',
  AuditLog: 'audit_log',
  Product: 'products',
  Variant: 'variants',
  Cart: 'carts',
  Order: 'orders',
  OrderItem: 'order_items',
  OrderStatusHistory: 'order_status_history',
  OrderOutbox: 'order_outbox',
  OrderIdempotency: 'order_idempotency',
  Notification: 'notifications',
  NotificationDelivery: 'notification_delivery',
  NotificationPreference: 'notification_preferences',
};

export class AppNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  tableName(className: string, customName: string): string {
    if (customName) {
      return customName;
    }
    return TABLE_NAMES[className] ?? snakeCase(className);
  }

  columnName(
    propertyName: string,
    customName: string,
    embeddedPrefixes: string[],
  ): string {
    const name = customName
      ? customName
      : [...embeddedPrefixes, propertyName].join('_');
    return snakeCase(name);
  }

  joinColumnName(relationName: string, referencedColumnName: string): string {
    return snakeCase(`${relationName}_${referencedColumnName}`);
  }

  joinTableName(
    firstTableName: string,
    secondTableName: string,
    firstPropertyName: string,
  ): string {
    return snakeCase(`${firstTableName}_${firstPropertyName.replace(/\./gi, '_')}_${secondTableName}`);
  }

  joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return snakeCase(`${tableName}_${columnName ?? propertyName}`);
  }
}
