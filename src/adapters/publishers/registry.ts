import type { PublisherAdapter } from "../../domain/publisher.js";
import { gihyoAdapter } from "./gihyo.js";
import { lambdanoteAdapter } from "./lambdanote.js";
import { tatsuZineAdapter } from "./tatsu-zine.js";

export const DEFAULT_PUBLISHERS: readonly PublisherAdapter[] = [
  gihyoAdapter,
  lambdanoteAdapter,
  tatsuZineAdapter,
];
