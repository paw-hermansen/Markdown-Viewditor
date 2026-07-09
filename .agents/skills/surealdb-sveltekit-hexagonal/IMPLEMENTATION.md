# Complete Layer-by-Layer Implementation Guide

This guide provides detailed implementation patterns for each layer of hexagonal architecture in SvelteKit with SurrealDB.

## Table of Contents

- [Domain Layer](#domain-layer)
- [Application Layer](#application-layer)
- [Infrastructure Layer](#infrastructure-layer)
- [API Routes](#api-routes)
- [Authentication](#authentication)
- [Advanced Patterns](#advanced-patterns)

## Domain Layer

### Entity with Rich Validation

src/lib/domain/entities/Product.ts:

```typescript
export class Product {
  private constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly description: string,
    public readonly price: number,
    public readonly inventory: number,
    public readonly metadata: ProductMetadata,
    public readonly tags: string[],
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static create(data: {
    name: string;
    description: string;
    price: number;
    inventory: number;
    metadata?: ProductMetadata;
    tags?: string[];
  }): Result<Product, ValidationError> {
    const errors: string[] = [];

    if (data.name.length < 3 || data.name.length > 200) {
      errors.push("Name must be 3-200 characters");
    }

    if (data.description.length > 2000) {
      errors.push("Description must be less than 2000 characters");
    }

    if (data.price < 0) {
      errors.push("Price cannot be negative");
    }

    if (data.inventory < 0) {
      errors.push("Inventory cannot be negative");
    }

    if (errors.length > 0) {
      return { ok: false, error: new ValidationError(errors.join(", ")) };
    }

    return {
      ok: true,
      value: new Product(
        "",
        data.name,
        data.description,
        data.price,
        data.inventory,
        data.metadata || {},
        data.tags || [],
        new Date(),
        new Date(),
      ),
    };
  }

  static fromDb(data: DbProduct): Product {
    return new Product(
      data.id,
      data.name,
      data.description,
      data.price,
      data.inventory,
      data.metadata,
      data.tags,
      new Date(data.created_at),
      new Date(data.updated_at),
    );
  }

  updatePrice(newPrice: number): Result<Product, ValidationError> {
    if (newPrice < 0) {
      return {
        ok: false,
        error: new ValidationError("Price cannot be negative"),
      };
    }

    return {
      ok: true,
      value: new Product(
        this.id,
        this.name,
        this.description,
        newPrice,
        this.inventory,
        this.metadata,
        this.tags,
        this.createdAt,
        new Date(),
      ),
    };
  }

  decrementInventory(amount: number): Result<Product, ValidationError> {
    if (amount > this.inventory) {
      return {
        ok: false,
        error: new ValidationError("Insufficient inventory"),
      };
    }

    return {
      ok: true,
      value: new Product(
        this.id,
        this.name,
        this.description,
        this.price,
        this.inventory - amount,
        this.metadata,
        this.tags,
        this.createdAt,
        new Date(),
      ),
    };
  }
}

interface ProductMetadata {
  brand?: string;
  model?: string;
  specifications?: Record<string, any>;
}

interface DbProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  inventory: number;
  metadata: ProductMetadata;
  tags: string[];
  created_at: string;
  updated_at: string;
}

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
```

### Value Objects

src/lib/domain/value-objects/Email.ts:

```typescript
export class Email {
  private constructor(private readonly value: string) {}

  static create(email: string): Result<Email, ValidationError> {
    const trimmed = email.trim().toLowerCase();

    if (!this.isValid(trimmed)) {
      return {
        ok: false,
        error: new ValidationError("Invalid email format"),
      };
    }

    if (trimmed.length > 255) {
      return {
        ok: false,
        error: new ValidationError("Email must be less than 255 characters"),
      };
    }

    return { ok: true, value: new Email(trimmed) };
  }

  private static isValid(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  toString(): string {
    return this.value;
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
}

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
```

src/lib/domain/value-objects/Money.ts:

```typescript
export class Money {
  private constructor(
    private readonly amount: number,
    private readonly currency: string,
  ) {}

  static create(
    amount: number,
    currency: string = "USD",
  ): Result<Money, ValidationError> {
    if (amount < 0) {
      return {
        ok: false,
        error: new ValidationError("Amount cannot be negative"),
      };
    }

    if (!["USD", "EUR", "GBP", "JPY"].includes(currency)) {
      return {
        ok: false,
        error: new ValidationError(`Unsupported currency: ${currency}`),
      };
    }

    return { ok: true, value: new Money(amount, currency) };
  }

  add(other: Money): Result<Money, ValidationError> {
    if (this.currency !== other.currency) {
      return {
        ok: false,
        error: new ValidationError("Cannot add different currencies"),
      };
    }

    return Money.create(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Result<Money, ValidationError> {
    if (this.currency !== other.currency) {
      return {
        ok: false,
        error: new ValidationError("Cannot subtract different currencies"),
      };
    }

    return Money.create(this.amount - other.amount, this.currency);
  }

  multiply(factor: number): Result<Money, ValidationError> {
    return Money.create(this.amount * factor, this.currency);
  }

  getAmount(): number {
    return this.amount;
  }

  getCurrency(): string {
    return this.currency;
  }

  toString(): string {
    return `${this.amount.toFixed(2)} ${this.currency}`;
  }
}

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
```

### Repository Interfaces

src/lib/domain/repositories/IProductRepository.ts:

```typescript
import type { Product } from "../entities/Product";

export interface IProductRepository {
  create(product: Product): Promise<Product>;
  findById(id: string): Promise<Product | null>;
  findByName(name: string): Promise<Product[]>;
  update(id: string, data: Partial<Product>): Promise<Product>;
  delete(id: string): Promise<void>;
  list(options?: ListOptions): Promise<Product[]>;
  search(query: SearchQuery): Promise<Product[]>;
  updateInventory(id: string, amount: number): Promise<Product>;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  filters?: Record<string, any>;
}

export interface SearchQuery {
  text?: string;
  tags?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
}
```

## Application Layer

### Use Case: Create Product

src/lib/application/use-cases/CreateProduct.ts:

```typescript
import type { IProductRepository } from "$lib/domain/repositories/IProductRepository";
import { Product } from "$lib/domain/entities/Product";

export interface CreateProductDto {
  name: string;
  description: string;
  price: number;
  inventory: number;
  metadata?: Record<string, any>;
  tags?: string[];
}

export class CreateProductUseCase {
  constructor(private readonly productRepository: IProductRepository) {}

  async execute(dto: CreateProductDto): Promise<Product> {
    const productResult = Product.create({
      name: dto.name,
      description: dto.description,
      price: dto.price,
      inventory: dto.inventory,
      metadata: dto.metadata,
      tags: dto.tags,
    });

    if (!productResult.ok) {
      throw productResult.error;
    }

    return await this.productRepository.create(productResult.value);
  }
}
```

### Use Case: Update Product Price

src/lib/application/use-cases/UpdateProductPrice.ts:

```typescript
import type { IProductRepository } from "$lib/domain/repositories/IProductRepository";

export class UpdateProductPriceUseCase {
  constructor(private readonly productRepository: IProductRepository) {}

  async execute(productId: string, newPrice: number): Promise<void> {
    const product = await this.productRepository.findById(productId);

    if (!product) {
      throw new Error("Product not found");
    }

    const updatedProductResult = product.updatePrice(newPrice);

    if (!updatedProductResult.ok) {
      throw updatedProductResult.error;
    }

    await this.productRepository.update(productId, {
      price: newPrice,
    });
  }
}
```

### Use Case: Process Order

src/lib/application/use-cases/ProcessOrder.ts:

```typescript
import type { IProductRepository } from "$lib/domain/repositories/IProductRepository";
import type { IOrderRepository } from "$lib/domain/repositories/IOrderRepository";
import { Order } from "$lib/domain/entities/Order";

export interface OrderItem {
  productId: string;
  quantity: number;
}

export interface ProcessOrderDto {
  userId: string;
  items: OrderItem[];
}

export class ProcessOrderUseCase {
  constructor(
    private readonly productRepository: IProductRepository,
    private readonly orderRepository: IOrderRepository,
  ) {}

  async execute(dto: ProcessOrderDto): Promise<Order> {
    const products = await Promise.all(
      dto.items.map((item) => this.productRepository.findById(item.productId)),
    );

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const item = dto.items[i];

      if (!product) {
        throw new Error(`Product ${item.productId} not found`);
      }

      const decrementResult = product.decrementInventory(item.quantity);
      if (!decrementResult.ok) {
        throw new Error(`${product.name}: ${decrementResult.error.message}`);
      }

      await this.productRepository.updateInventory(
        item.productId,
        -item.quantity,
      );
    }

    const total = products.reduce((sum, product, i) => {
      return sum + product!.price * dto.items[i].quantity;
    }, 0);

    const orderResult = Order.create({
      userId: dto.userId,
      items: dto.items,
      total,
    });

    if (!orderResult.ok) {
      throw orderResult.error;
    }

    return await this.orderRepository.create(orderResult.value);
  }
}
```

### Service Interfaces (Ports)

src/lib/application/ports/IEmailService.ts:

```typescript
export interface IEmailService {
  sendWelcomeEmail(email: string, name: string): Promise<void>;
  sendOrderConfirmation(email: string, orderId: string): Promise<void>;
  sendPasswordReset(email: string, token: string): Promise<void>;
}
```

src/lib/application/ports/IPaymentService.ts:

```typescript
export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export interface IPaymentService {
  processPayment(
    amount: number,
    currency: string,
    token: string,
  ): Promise<PaymentResult>;
  refund(transactionId: string): Promise<PaymentResult>;
}
```

## Infrastructure Layer

### SurrealDB Product Repository

src/lib/infrastructure/persistence/surrealdb/SurrealProductRepository.ts:

```typescript
import type { Surreal } from "surrealdb";
import { RecordId } from "surrealdb";
import type {
  IProductRepository,
  ListOptions,
  SearchQuery,
} from "$lib/domain/repositories/IProductRepository";
import { Product } from "$lib/domain/entities/Product";

interface DbProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  inventory: number;
  metadata: Record<string, any>;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export class SurrealProductRepository implements IProductRepository {
  constructor(private readonly db: Surreal) {}

  async create(product: Product): Promise<Product> {
    const result = await this.db.query<[DbProduct[]]>(
      `CREATE product CONTENT {
        name: $name,
        description: $description,
        price: $price,
        inventory: $inventory,
        metadata: $metadata,
        tags: $tags,
        created_at: time::now(),
        updated_at: time::now()
      }`,
      {
        name: product.name,
        description: product.description,
        price: product.price,
        inventory: product.inventory,
        metadata: product.metadata,
        tags: product.tags,
      },
    );

    if (!result[0]?.result?.[0]) {
      throw new Error("Failed to create product");
    }

    return Product.fromDb(result[0].result[0]);
  }

  async findById(id: string): Promise<Product | null> {
    const result = await this.db.query<[DbProduct[]]>(
      "SELECT * FROM $productId",
      { productId: new RecordId("product", id) },
    );

    const product = result[0]?.result?.[0];
    return product ? Product.fromDb(product) : null;
  }

  async findByName(name: string): Promise<Product[]> {
    const result = await this.db.query<[DbProduct[]]>(
      "SELECT * FROM product WHERE name CONTAINS $name",
      { name },
    );

    return (result[0]?.result || []).map(Product.fromDb);
  }

  async update(id: string, data: Partial<Product>): Promise<Product> {
    const result = await this.db.query<[DbProduct[]]>(
      `UPDATE $productId MERGE {
        ${data.name ? "name: $name," : ""}
        ${data.description ? "description: $description," : ""}
        ${data.price !== undefined ? "price: $price," : ""}
        ${data.inventory !== undefined ? "inventory: $inventory," : ""}
        ${data.metadata ? "metadata: $metadata," : ""}
        ${data.tags ? "tags: $tags," : ""}
        updated_at: time::now()
      } RETURN AFTER`,
      {
        productId: new RecordId("product", id),
        ...(data.name && { name: data.name }),
        ...(data.description && { description: data.description }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.inventory !== undefined && { inventory: data.inventory }),
        ...(data.metadata && { metadata: data.metadata }),
        ...(data.tags && { tags: data.tags }),
      },
    );

    if (!result[0]?.result?.[0]) {
      throw new Error("Failed to update product");
    }

    return Product.fromDb(result[0].result[0]);
  }

  async delete(id: string): Promise<void> {
    await this.db.query("DELETE $productId", {
      productId: new RecordId("product", id),
    });
  }

  async list(options: ListOptions = {}): Promise<Product[]> {
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const sortBy = options.sortBy || "created_at";
    const sortOrder = options.sortOrder || "desc";

    let whereClause = "";
    if (options.filters) {
      const conditions = Object.entries(options.filters)
        .map(([key, value]) => `${key} = $filter_${key}`)
        .join(" AND ");
      whereClause = conditions ? `WHERE ${conditions}` : "";
    }

    const result = await this.db.query<[DbProduct[]]>(
      `SELECT * FROM product
       ${whereClause}
       ORDER BY ${sortBy} ${sortOrder.toUpperCase()}
       LIMIT $limit
       START $offset`,
      {
        limit,
        offset,
        ...(options.filters &&
          Object.fromEntries(
            Object.entries(options.filters).map(([key, value]) => [
              `filter_${key}`,
              value,
            ]),
          )),
      },
    );

    return (result[0]?.result || []).map(Product.fromDb);
  }

  async search(query: SearchQuery): Promise<Product[]> {
    const conditions: string[] = [];
    const params: Record<string, any> = {};

    if (query.text) {
      conditions.push("(name CONTAINS $text OR description CONTAINS $text)");
      params.text = query.text;
    }

    if (query.tags && query.tags.length > 0) {
      conditions.push("tags CONTAINSANY $tags");
      params.tags = query.tags;
    }

    if (query.minPrice !== undefined) {
      conditions.push("price >= $minPrice");
      params.minPrice = query.minPrice;
    }

    if (query.maxPrice !== undefined) {
      conditions.push("price <= $maxPrice");
      params.maxPrice = query.maxPrice;
    }

    if (query.inStock) {
      conditions.push("inventory > 0");
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await this.db.query<[DbProduct[]]>(
      `SELECT * FROM product ${whereClause} ORDER BY created_at DESC LIMIT 100`,
      params,
    );

    return (result[0]?.result || []).map(Product.fromDb);
  }

  async updateInventory(id: string, amount: number): Promise<Product> {
    const result = await this.db.query<[DbProduct[]]>(
      `UPDATE $productId SET
        inventory += $amount,
        updated_at = time::now()
       RETURN AFTER`,
      {
        productId: new RecordId("product", id),
        amount,
      },
    );

    if (!result[0]?.result?.[0]) {
      throw new Error("Failed to update inventory");
    }

    return Product.fromDb(result[0].result[0]);
  }
}
```

### External Service Adapters

src/lib/infrastructure/services/SendGridEmailService.ts:

```typescript
import type { IEmailService } from "$lib/application/ports/IEmailService";

export class SendGridEmailService implements IEmailService {
  constructor(private readonly apiKey: string) {}

  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    console.log(`Sending welcome email to ${email}`);
  }

  async sendOrderConfirmation(email: string, orderId: string): Promise<void> {
    console.log(`Sending order confirmation to ${email} for order ${orderId}`);
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    console.log(`Sending password reset to ${email} with token ${token}`);
  }
}
```

src/lib/infrastructure/services/StripePaymentService.ts:

```typescript
import type {
  IPaymentService,
  PaymentResult,
} from "$lib/application/ports/IPaymentService";

export class StripePaymentService implements IPaymentService {
  constructor(private readonly secretKey: string) {}

  async processPayment(
    amount: number,
    currency: string,
    token: string,
  ): Promise<PaymentResult> {
    try {
      console.log(`Processing payment: ${amount} ${currency}`);

      return {
        success: true,
        transactionId: "txn_" + Math.random().toString(36).substring(7),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Payment failed",
      };
    }
  }

  async refund(transactionId: string): Promise<PaymentResult> {
    try {
      console.log(`Refunding transaction: ${transactionId}`);

      return {
        success: true,
        transactionId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Refund failed",
      };
    }
  }
}
```

## API Routes

### RESTful API Endpoint

src/routes/api/products/+server.ts:

```typescript
import type { RequestHandler } from "./$types";
import { json, error } from "@sveltejs/kit";
import { CreateProductUseCase } from "$lib/application/use-cases/CreateProduct";
import { SurrealProductRepository } from "$lib/infrastructure/persistence/surrealdb/SurrealProductRepository";

export const GET: RequestHandler = async ({ url, locals }) => {
  const page = Number(url.searchParams.get("page")) || 1;
  const limit = Number(url.searchParams.get("limit")) || 20;
  const search = url.searchParams.get("search");

  if (limit > 100) {
    throw error(400, "Limit cannot exceed 100");
  }

  const repository = new SurrealProductRepository(locals.db);

  if (search) {
    const products = await repository.search({ text: search });
    return json({ products });
  }

  const products = await repository.list({
    limit,
    offset: (page - 1) * limit,
    sortBy: "created_at",
    sortOrder: "desc",
  });

  return json({ products, page, limit });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json();

  if (!body.name || !body.description || body.price === undefined) {
    throw error(400, "Missing required fields");
  }

  const repository = new SurrealProductRepository(locals.db);
  const useCase = new CreateProductUseCase(repository);

  try {
    const product = await useCase.execute({
      name: body.name,
      description: body.description,
      price: body.price,
      inventory: body.inventory || 0,
      metadata: body.metadata,
      tags: body.tags,
    });

    return json(product, { status: 201 });
  } catch (err) {
    if (err instanceof Error) {
      throw error(400, err.message);
    }
    throw error(500, "Internal server error");
  }
};
```

src/routes/api/products/[id]/+server.ts:

```typescript
import type { RequestHandler } from "./$types";
import { json, error } from "@sveltejs/kit";
import { SurrealProductRepository } from "$lib/infrastructure/persistence/surrealdb/SurrealProductRepository";

export const GET: RequestHandler = async ({ params, locals }) => {
  const repository = new SurrealProductRepository(locals.db);
  const product = await repository.findById(params.id);

  if (!product) {
    throw error(404, "Product not found");
  }

  return json(product);
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const body = await request.json();
  const repository = new SurrealProductRepository(locals.db);

  try {
    const product = await repository.update(params.id, body);
    return json(product);
  } catch (err) {
    if (err instanceof Error) {
      throw error(400, err.message);
    }
    throw error(500, "Internal server error");
  }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const repository = new SurrealProductRepository(locals.db);

  await repository.delete(params.id);

  return json({ success: true });
};
```

## Authentication

### Authentication Schema

schema/auth.surql:

```surrealql
DEFINE TABLE user SCHEMAFULL
  PERMISSIONS
    FOR select, update, delete WHERE id = $auth.id;

DEFINE FIELD name ON user TYPE string;
DEFINE FIELD email ON user TYPE string ASSERT string::is_email($value);
DEFINE FIELD password ON user TYPE string;
DEFINE FIELD created_at ON user TYPE datetime;

DEFINE INDEX email ON user FIELDS email UNIQUE;

DEFINE ACCESS user ON DATABASE TYPE RECORD
  SIGNIN (
    SELECT * FROM user
    WHERE email = $email
    AND crypto::argon2::compare(password, $password)
  )
  SIGNUP (
    CREATE user CONTENT {
      name: $name,
      email: $email,
      password: crypto::argon2::generate($password),
      created_at: time::now()
    }
  );
```

### Authentication Service

src/lib/infrastructure/auth/SurrealAuthService.ts:

```typescript
import type { Surreal } from "surrealdb";

export interface SignupData {
  name: string;
  email: string;
  password: string;
}

export interface SigninData {
  email: string;
  password: string;
}

export class SurrealAuthService {
  constructor(
    private readonly db: Surreal,
    private readonly namespace: string,
    private readonly database: string,
  ) {}

  async signup(data: SignupData): Promise<string> {
    try {
      const token = await this.db.signup({
        namespace: this.namespace,
        database: this.database,
        access: "user",
        variables: {
          name: data.name,
          email: data.email,
          password: data.password,
        },
      });

      return token;
    } catch (error) {
      throw new Error(
        "Signup failed: " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    }
  }

  async signin(data: SigninData): Promise<string> {
    try {
      const token = await this.db.signin({
        namespace: this.namespace,
        database: this.database,
        access: "user",
        variables: {
          email: data.email,
          password: data.password,
        },
      });

      return token;
    } catch (error) {
      throw new Error(
        "Signin failed: " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    }
  }

  async authenticate(token: string): Promise<void> {
    await this.db.authenticate(token);
  }

  async getUserInfo(): Promise<any> {
    return await this.db.info();
  }

  async invalidate(): Promise<void> {
    await this.db.invalidate();
  }
}
```

### Auth Routes

src/routes/auth/signup/+page.server.ts:

```typescript
import type { Actions } from "./$types";
import { fail, redirect } from "@sveltejs/kit";
import { SurrealAuthService } from "$lib/infrastructure/auth/SurrealAuthService";
import { config } from "$lib/infrastructure/persistence/surrealdb/connection";

export const actions: Actions = {
  default: async ({ request, locals, cookies }) => {
    const formData = await request.formData();
    const name = formData.get("name");
    const email = formData.get("email");
    const password = formData.get("password");

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return fail(400, { error: "Invalid form data" });
    }

    if (password.length < 8) {
      return fail(400, { error: "Password must be at least 8 characters" });
    }

    const authService = new SurrealAuthService(
      locals.db,
      config.namespace,
      config.database,
    );

    try {
      const token = await authService.signup({ name, email, password });

      cookies.set("auth_token", token, {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: 60 * 60 * 24 * 7,
      });

      throw redirect(302, "/dashboard");
    } catch (err) {
      if (err instanceof Error) {
        return fail(400, { error: err.message });
      }
      return fail(500, { error: "Unknown error occurred" });
    }
  },
};
```

## Advanced Patterns

### Dependency Injection Container

src/lib/infrastructure/di/container.ts:

```typescript
import type { Surreal } from "surrealdb";
import { SurrealUserRepository } from "$lib/infrastructure/persistence/surrealdb/SurrealUserRepository";
import { SurrealProductRepository } from "$lib/infrastructure/persistence/surrealdb/SurrealProductRepository";
import { CreateUserUseCase } from "$lib/application/use-cases/CreateUser";
import { CreateProductUseCase } from "$lib/application/use-cases/CreateProduct";

export class Container {
  constructor(private readonly db: Surreal) {}

  getUserRepository() {
    return new SurrealUserRepository(this.db);
  }

  getProductRepository() {
    return new SurrealProductRepository(this.db);
  }

  getCreateUserUseCase() {
    return new CreateUserUseCase(this.getUserRepository());
  }

  getCreateProductUseCase() {
    return new CreateProductUseCase(this.getProductRepository());
  }
}
```

Usage in hooks.server.ts:

```typescript
import { Container } from "$lib/infrastructure/di/container";

const handleDatabase: Handle = async ({ event, resolve }) => {
  const db = await createConnection(config);
  event.locals.container = new Container(db);

  const response = await resolve(event);

  await db.close();

  return response;
};
```

### Error Handling Middleware

src/lib/infrastructure/web/middleware/errorHandler.ts:

```typescript
import { error as svelteError } from "@sveltejs/kit";
import { ValidationError } from "$lib/domain/entities/User";

export function handleDomainError(err: unknown): never {
  if (err instanceof ValidationError) {
    throw svelteError(400, err.message);
  }

  if (err instanceof Error) {
    if (err.message.includes("not found")) {
      throw svelteError(404, err.message);
    }

    if (err.message.includes("already exists")) {
      throw svelteError(409, err.message);
    }

    throw svelteError(500, "Internal server error");
  }

  throw svelteError(500, "Unknown error occurred");
}
```

### Repository Base Class

src/lib/infrastructure/persistence/surrealdb/BaseRepository.ts:

```typescript
import type { Surreal } from "surrealdb";
import { RecordId } from "surrealdb";

export abstract class BaseRepository<T> {
  constructor(
    protected readonly db: Surreal,
    protected readonly table: string,
  ) {}

  protected createRecordId(id: string): RecordId {
    return new RecordId(this.table, id);
  }

  protected async queryOne<R = any>(
    query: string,
    params?: Record<string, any>,
  ): Promise<R | null> {
    const result = await this.db.query<[R[]]>(query, params);
    return result[0]?.result?.[0] || null;
  }

  protected async queryMany<R = any>(
    query: string,
    params?: Record<string, any>,
  ): Promise<R[]> {
    const result = await this.db.query<[R[]]>(query, params);
    return result[0]?.result || [];
  }

  protected async execute(
    query: string,
    params?: Record<string, any>,
  ): Promise<void> {
    await this.db.query(query, params);
  }
}
```

Usage:

```typescript
export class SurrealUserRepository
  extends BaseRepository<DbUser>
  implements IUserRepository
{
  constructor(db: Surreal) {
    super(db, "user");
  }

  async findById(id: string): Promise<User | null> {
    const user = await this.queryOne<DbUser>("SELECT * FROM $userId", {
      userId: this.createRecordId(id),
    });

    return user ? User.fromDb(user) : null;
  }
}
```
