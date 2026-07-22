import { DataSource } from 'typeorm';
import { TypeOrmProductRepository } from './typeorm.repositories';
import { createStructuredLog, logJson } from '@food-ordering/observability';
import type { CreateProductInput } from '../../domain/types';

type FoodSeed = {
  name: string;
  description: string;
  imageUrl: string;
  variants: Array<{ label: string; price: string }>;
};

/** Real food catalog with Unsplash food photos and PKR prices */
const FOOD_MENU: FoodSeed[] = [
  {
    name: 'Chicken Biryani',
    description: 'Fragrant basmati rice layered with spiced chicken and fried onions.',
    imageUrl: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Regular', price: '450.00' },
      { label: 'Large', price: '650.00' },
    ],
  },
  {
    name: 'Beef Nihari',
    description: 'Slow-cooked beef shank in a rich, spicy gravy. Served with naan.',
    imageUrl: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Single', price: '520.00' },
      { label: 'Family', price: '1450.00' },
    ],
  },
  {
    name: 'Chicken Karahi',
    description: 'Tomato-based karahi with green chillies, ginger, and fresh coriander.',
    imageUrl: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae173?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Half', price: '780.00' },
      { label: 'Full', price: '1450.00' },
    ],
  },
  {
    name: 'Seekh Kabab Platter',
    description: 'Charcoal-grilled minced beef seekh kababs with mint chutney.',
    imageUrl: 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: '4 pcs', price: '480.00' },
      { label: '8 pcs', price: '890.00' },
    ],
  },
  {
    name: 'Chicken Tikka',
    description: 'Yogurt-marinated chicken grilled over charcoal.',
    imageUrl: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Half', price: '550.00' },
      { label: 'Full', price: '980.00' },
    ],
  },
  {
    name: 'Mutton Pulao',
    description: 'Yakhni pulao with tender mutton pieces and whole spices.',
    imageUrl: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Regular', price: '620.00' },
      { label: 'Large', price: '920.00' },
    ],
  },
  {
    name: 'Chicken Handi',
    description: 'Creamy handi curry with boneless chicken and kasuri methi.',
    imageUrl: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Regular', price: '720.00' },
      { label: 'Large', price: '1280.00' },
    ],
  },
  {
    name: 'Chapli Kabab',
    description: 'Peshawari-style flat kababs with crushed pomegranate seeds.',
    imageUrl: 'https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: '2 pcs', price: '380.00' },
      { label: '4 pcs', price: '720.00' },
    ],
  },
  {
    name: 'Fish Fry',
    description: 'Crispy masala fish fillets with lemon and tartar sauce.',
    imageUrl: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Regular', price: '690.00' },
      { label: 'Large', price: '1190.00' },
    ],
  },
  {
    name: 'Chicken Shawarma Wrap',
    description: 'Spiced chicken shawarma in a soft wrap with garlic sauce.',
    imageUrl: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Single', price: '320.00' },
      { label: 'Meal (fries + drink)', price: '520.00' },
    ],
  },
  {
    name: 'Beef Burger',
    description: 'Juicy beef patty, cheddar, lettuce, and house sauce.',
    imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Classic', price: '450.00' },
      { label: 'Double', price: '680.00' },
    ],
  },
  {
    name: 'Zinger Burger',
    description: 'Crispy fried chicken fillet burger with spicy mayo.',
    imageUrl: 'https://images.unsplash.com/photo-1606755962773-d324e0a13086?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Regular', price: '420.00' },
      { label: 'Meal', price: '650.00' },
    ],
  },
  {
    name: 'Margherita Pizza',
    description: 'Wood-fired pizza with mozzarella, tomato, and basil.',
    imageUrl: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d264?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Small 7"', price: '690.00' },
      { label: 'Large 12"', price: '1290.00' },
    ],
  },
  {
    name: 'Chicken Fajita Pizza',
    description: 'Loaded pizza with fajita chicken, peppers, and onions.',
    imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Small 7"', price: '790.00' },
      { label: 'Large 12"', price: '1490.00' },
    ],
  },
  {
    name: 'Pasta Alfredo',
    description: 'Creamy Alfredo pasta with grilled chicken.',
    imageUrl: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Regular', price: '750.00' },
      { label: 'Large', price: '990.00' },
    ],
  },
  {
    name: 'Chicken Wings',
    description: 'Crispy wings tossed in hot buffalo sauce.',
    imageUrl: 'https://images.unsplash.com/photo-1527477396000-e27173b8ba9f?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: '6 pcs', price: '490.00' },
      { label: '12 pcs', price: '890.00' },
    ],
  },
  {
    name: 'Club Sandwich',
    description: 'Triple-decker sandwich with chicken, egg, and veggies.',
    imageUrl: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Regular', price: '480.00' },
      { label: 'With fries', price: '620.00' },
    ],
  },
  {
    name: 'Loaded Fries',
    description: 'Crispy fries topped with cheese sauce and jalapeños.',
    imageUrl: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Regular', price: '350.00' },
      { label: 'Large', price: '520.00' },
    ],
  },
  {
    name: 'Chicken Caesar Salad',
    description: 'Romaine, grilled chicken, croutons, and Caesar dressing.',
    imageUrl: 'https://images.unsplash.com/photo-1546793665-c74683f339c1?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Regular', price: '590.00' },
      { label: 'Large', price: '790.00' },
    ],
  },
  {
    name: 'Dal Makhani',
    description: 'Slow-cooked black lentils finished with butter and cream.',
    imageUrl: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Regular', price: '380.00' },
      { label: 'Large', price: '560.00' },
    ],
  },
  {
    name: 'Palak Paneer',
    description: 'Spinach curry with soft paneer cubes.',
    imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Regular', price: '420.00' },
      { label: 'Large', price: '620.00' },
    ],
  },
  {
    name: 'Vegetable Samosa',
    description: 'Crispy pastry filled with spiced potatoes and peas.',
    imageUrl: 'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd2?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: '2 pcs', price: '180.00' },
      { label: '4 pcs', price: '320.00' },
    ],
  },
  {
    name: 'Chicken Momos',
    description: 'Steamed dumplings with chicken filling and spicy chutney.',
    imageUrl: 'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: '8 pcs', price: '390.00' },
      { label: '12 pcs', price: '540.00' },
    ],
  },
  {
    name: 'Beef Steak',
    description: 'Grilled beef steak with pepper sauce and mashed potatoes.',
    imageUrl: 'https://images.unsplash.com/photo-1600891964092-4316c288032e?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: '200g', price: '1890.00' },
      { label: '300g', price: '2490.00' },
    ],
  },
  {
    name: 'Grilled Salmon',
    description: 'Pan-seared salmon with lemon butter and seasonal greens.',
    imageUrl: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Regular', price: '2190.00' },
      { label: 'Large', price: '2790.00' },
    ],
  },
  {
    name: 'Chicken Fried Rice',
    description: 'Wok-tossed rice with chicken, egg, and vegetables.',
    imageUrl: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Regular', price: '480.00' },
      { label: 'Large', price: '680.00' },
    ],
  },
  {
    name: 'Chicken Chow Mein',
    description: 'Stir-fried noodles with chicken and crunchy vegetables.',
    imageUrl: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Regular', price: '490.00' },
      { label: 'Large', price: '690.00' },
    ],
  },
  {
    name: 'Thai Green Curry',
    description: 'Coconut green curry with chicken and Thai basil.',
    imageUrl: 'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Regular', price: '820.00' },
      { label: 'Large', price: '1120.00' },
    ],
  },
  {
    name: 'Sushi Combo',
    description: 'Assorted fresh sushi rolls with wasabi and soy.',
    imageUrl: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: '12 pcs', price: '1590.00' },
      { label: '24 pcs', price: '2890.00' },
    ],
  },
  {
    name: 'Tandoori Roti Basket',
    description: 'Fresh tandoor-baked rotis, served hot.',
    imageUrl: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: '2 pcs', price: '80.00' },
      { label: '4 pcs', price: '140.00' },
    ],
  },
  {
    name: 'Garlic Naan',
    description: 'Butter garlic naan from the tandoor.',
    imageUrl: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: '1 pc', price: '90.00' },
      { label: '2 pcs', price: '160.00' },
    ],
  },
  {
    name: 'Mango Lassi',
    description: 'Chilled sweet mango yogurt drink.',
    imageUrl: 'https://images.unsplash.com/photo-1525385133512-2f3bdd039054?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Regular', price: '220.00' },
      { label: 'Large', price: '320.00' },
    ],
  },
  {
    name: 'Fresh Lime Soda',
    description: 'Sweet & salty lime soda over ice.',
    imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Regular', price: '180.00' },
      { label: 'Large', price: '250.00' },
    ],
  },
  {
    name: 'Chocolate Brownie',
    description: 'Warm fudge brownie with vanilla ice cream.',
    imageUrl: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Single', price: '350.00' },
      { label: 'With ice cream', price: '480.00' },
    ],
  },
  {
    name: 'Gulab Jamun',
    description: 'Soft milk dumplings soaked in rose syrup.',
    imageUrl: 'https://images.unsplash.com/photo-1666195111569-63a0515da116?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: '2 pcs', price: '200.00' },
      { label: '4 pcs', price: '360.00' },
    ],
  },
  {
    name: 'Kheer',
    description: 'Creamy rice pudding topped with nuts and cardamom.',
    imageUrl: 'https://images.unsplash.com/photo-1571115177098-24ec42c46d91?auto=format&fit=crop&w=640&h=480&q=80',
    variants: [
      { label: 'Regular', price: '250.00' },
      { label: 'Large', price: '380.00' },
    ],
  },
];

/**
 * Replaces catalog with a real food menu (PKR prices + food images).
 * Clears existing products/variants, then inserts FOOD_MENU (optionally cycled to target count).
 */
export async function seedCatalogProducts(dataSource: DataSource): Promise<void> {
  const target = Number(process.env.CATALOG_SEED_PRODUCT_COUNT ?? FOOD_MENU.length);
  const batchSize = Number(process.env.CATALOG_SEED_BATCH_SIZE ?? 100);
  const reset = process.env.CATALOG_SEED_RESET !== 'false';

  if (reset) {
    logJson(createStructuredLog('catalog', 'info', 'catalog seed resetting products table'));
    await dataSource.query('TRUNCATE TABLE variants, products RESTART IDENTITY CASCADE');
    await dataSource.query('TRUNCATE TABLE carts RESTART IDENTITY CASCADE').catch(() => undefined);
  }

  const repo = new TypeOrmProductRepository(dataSource.manager);
  const existing = await repo.countProducts();
  if (existing >= target) {
    logJson(
      createStructuredLog('catalog', 'info', 'catalog seed skipped — target already met', null, {
        existing,
        target,
      }),
    );
    return;
  }

  const toCreate = target - existing;
  let created = 0;

  logJson(
    createStructuredLog('catalog', 'info', 'catalog food seed starting', null, {
      existing,
      toCreate,
      menuSize: FOOD_MENU.length,
      currency: 'PKR',
    }),
  );

  while (created < toCreate) {
    const size = Math.min(batchSize, toCreate - created);
    const batch: CreateProductInput[] = [];
    for (let i = 0; i < size; i++) {
      const index = existing + created + i;
      const base = FOOD_MENU[index % FOOD_MENU.length];
      const cycle = Math.floor(index / FOOD_MENU.length);
      const name = cycle === 0 ? base.name : `${base.name} (${cycle + 1})`;
      batch.push({
        name,
        description: base.description,
        isActive: true,
        imageUrl: base.imageUrl,
        variants: base.variants.map((v) => ({
          label: v.label,
          price: v.price,
          isActive: true,
        })),
      });
    }
    await repo.bulkInsert(batch);
    created += size;
    logJson(
      createStructuredLog('catalog', 'info', 'catalog food seed progress', null, {
        created,
        toCreate,
      }),
    );
  }

  logJson(
    createStructuredLog('catalog', 'info', 'catalog food seed complete', null, {
      created,
      target,
    }),
  );
}
