import { db } from "../config/db.js";

/**
 * Business collections for the MyWedding marketplace — all in the shared
 * `mywedding` database. Users are owned by Better Auth (src/auth/index.js) —
 * we do not create or duplicate any authentication collections here.
 */
export const services = db.collection("services");
export const bookings = db.collection("bookings");
export const transactions = db.collection("transactions");

// JSON-Schema validators (MongoDB 5.0+). "References" (foreign keys) are
// stored as the referenced document's _id:
// - services.vendorId     -> user._id (Better Auth user, stored as a string id)
// - bookings.serviceId    -> services._id (BSON ObjectId)
// - bookings.vendorId     -> user._id
// - bookings.customerId   -> user._id
// - transactions.vendorId -> user._id
const servicesSchema = {
  bsonType: "object",
  required: ["vendorId", "serviceName", "category", "description", "price", "status", "createdAt"],
  properties: {
    vendorId: { bsonType: "string", description: "Better Auth user id of the owning vendor" },
    // Set to true by admins (approve). Not user-editable.
    approved: { bsonType: "bool" },
    serviceName: { bsonType: "string", minLength: 1, maxLength: 200, description: "Name of the offered service" },
    category: { bsonType: "string", minLength: 1, maxLength: 100 },
    description: { bsonType: "string", minLength: 1, maxLength: 5000 },
    price: { bsonType: ["double", "int"], minimum: 0, description: "Service price (non-negative)" },
    location: { bsonType: "string", maxLength: 200, description: "Where the service is offered" },
    images: {
      bsonType: "array",
      maxItems: 10,
      items: { bsonType: "string", maxLength: 2000000 },
      description: "Image URLs or raster image data URLs",
    },
    status: { bsonType: "string", enum: ["pending", "active", "inactive"] },
    createdAt: { bsonType: "date" },
  },
};

const bookingsSchema = {
  bsonType: "object",
  required: ["serviceId", "vendorId", "customerId", "eventDate", "status", "createdAt"],
  properties: {
    serviceId: { bsonType: "objectId", description: "Reference to services._id" },
    vendorId: { bsonType: "string", description: "Better Auth user id of the vendor" },
    customerId: { bsonType: "string", description: "Better Auth user id of the customer" },
    eventDate: { bsonType: "date", description: "Date of the booking" },
    eventLocation: { bsonType: "string", maxLength: 300 },
    message: { bsonType: "string", maxLength: 3000 },
    status: { bsonType: "string", enum: ["pending", "accepted", "rejected", "cancelled"] },
    createdAt: { bsonType: "date" },
    respondedAt: { bsonType: "date", description: "When the vendor accepted/rejected" },
  },
};

const transactionsSchema = {
  bsonType: "object",
  required: ["vendorId", "plan", "amount", "currency", "stripeSessionId", "status", "createdAt"],
  properties: {
    vendorId: { bsonType: "string", description: "Better Auth user id of the vendor" },
    plan: { bsonType: "string", minLength: 1, description: "The subscription plan name" },
    amount: { bsonType: ["double", "int"], minimum: 0, description: "Amount in the currency's smallest unit (e.g., cents)" },
    currency: { bsonType: "string", pattern: "^[A-Z]{3}$" },
    stripeSessionId: { bsonType: "string", minLength: 1 },
    stripeSubscriptionId: { bsonType: ["string", "null"], description: "Nullable — the Stripe subscription may not be created yet" },
    status: { bsonType: "string", enum: ["pending", "succeeded", "refunded"] },
    createdAt: { bsonType: "date" },
  },
};

async function ensureCollection(name, options) {
  try {
    await db.createCollection(name, options);
  } catch (err) {
    // NamespaceExists (48): already created — fine (idempotent).
    if (err?.code !== 48 && err?.codeName !== "NamespaceExists") throw err;
  }
}

/** Creates the business collections with their validation rules (idempotent). */
export async function ensureCollections() {
  await Promise.all([
    ensureCollection("services", { validator: { $jsonSchema: servicesSchema } }),
    ensureCollection("bookings", { validator: { $jsonSchema: bookingsSchema } }),
    ensureCollection("transactions", { validator: { $jsonSchema: transactionsSchema } }),
  ]);
}

/** Creates the business indexes (idempotent). */
export async function ensureIndexes() {
  await Promise.all([
    // services
    services.createIndex({ vendorId: 1 }, { name: "services_vendor" }),
    services.createIndex({ category: 1 }, { name: "services_category" }),
    services.createIndex({ status: 1 }, { name: "services_status" }),
    services.createIndex({ approved: 1, status: 1 }, { name: "services_public" }),
    services.createIndex({ price: 1 }, { name: "services_price" }),
    services.createIndex({ location: 1 }, { name: "services_location" }),
    // bookings — the partial unique index prevents duplicate "pending"
    // (active) booking requests for the same service + customer.
    bookings.createIndex({ serviceId: 1 }, { name: "bookings_service" }),
    bookings.createIndex({ vendorId: 1 }, { name: "bookings_vendor" }),
    bookings.createIndex({ vendorId: 1, status: 1 }, { name: "bookings_vendor_status" }),
    bookings.createIndex({ customerId: 1 }, { name: "bookings_customer" }),
    bookings.createIndex({ eventDate: 1 }, { name: "bookings_event_date" }),
    bookings.createIndex({ status: 1 }, { name: "bookings_status" }),
    bookings.createIndex({ createdAt: -1 }, { name: "bookings_created_at_desc" }),
    bookings.createIndex(
      { serviceId: 1, customerId: 1 },
      { name: "bookings_pending_service_customer", unique: true, partialFilterExpression: { status: "pending" } }
    ),
    // transactions
    transactions.createIndex({ vendorId: 1 }, { name: "transactions_vendor" }),
    transactions.createIndex({ status: 1 }, { name: "transactions_status" }),
    transactions.createIndex({ createdAt: -1 }, { name: "transactions_created_at_desc" }),
    transactions.createIndex({ stripeSessionId: 1 }, { name: "transactions_stripe_session", unique: true }),
    transactions.createIndex({ stripeSubscriptionId: 1 }, { name: "transactions_stripe_subscription", unique: true, sparse: true }),
  ]);
}
