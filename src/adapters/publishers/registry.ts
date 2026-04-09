import type { PublisherAdapter } from "../../domain/publisher.js";
import { gihyoAdapter } from "./gihyo.js";
import { lambdanoteAdapter } from "./lambdanote.js";
import { manateeAdapter } from "./manatee.js";
import { maruzenPublishingAdapter } from "./maruzen-publishing.js";
import { oreillyJapanAdapter } from "./oreilly-japan.js";
import { rutlesAdapter } from "./rutles.js";
import { saiensuAdapter } from "./saiensu.js";
import { seshopAdapter } from "./seshop.js";
import { tatsuZineAdapter } from "./tatsu-zine.js";
import { techbookfestAdapter } from "./techbookfest.js";

export const DEFAULT_PUBLISHERS: readonly PublisherAdapter[] = [
  gihyoAdapter,
  lambdanoteAdapter,
  manateeAdapter,
  maruzenPublishingAdapter,
  oreillyJapanAdapter,
  rutlesAdapter,
  saiensuAdapter,
  seshopAdapter,
  tatsuZineAdapter,
  techbookfestAdapter,
];
