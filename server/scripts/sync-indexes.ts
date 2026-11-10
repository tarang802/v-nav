/**
 * Release step: builds/updates MongoDB indexes before new code takes traffic.
 *   npm run db:indexes
 */
import mongoose from 'mongoose';
import { loadConfig } from '../src/config/env.js';
import { registerModels, syncAllIndexes } from '../src/models/index.js';

const config = loadConfig();
const conn = await mongoose.createConnection(config.mongo.uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
try {
  const models = registerModels(conn);
  await syncAllIndexes(models);
  for (const [name, model] of Object.entries(models)) {
    const indexes = await model.listIndexes();
    console.log(`${name}: ${indexes.map((i: { name: string }) => i.name).join(', ')}`);
  }
} finally {
  await conn.close();
}
