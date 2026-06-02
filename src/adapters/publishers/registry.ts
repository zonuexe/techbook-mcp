import type { PublisherAdapter } from "../../domain/publisher.js";
import { bookTechAdapter } from "./book-tech.js";
import { googleBooksAdapter } from "./google-books.js";
import { bornDigitalAdapter } from "./born-digital.js";
import { coronashaAdapter } from "./coronasha.js";
import { cqPublishingAdapter } from "./cq-publishing.js";
import { gihyoAdapter } from "./gihyo.js";
import { impressBooksAdapter } from "./impress.js";
import { jusePAdapter } from "./juse-p.js";
import { lambdanoteAdapter } from "./lambdanote.js";
import { manateeAdapter } from "./manatee.js";
import { maruzenPublishingAdapter } from "./maruzen-publishing.js";
import { optronicsAdapter } from "./optronics.js";
import { oreillyJapanAdapter } from "./oreilly-japan.js";
import { peaksAdapter } from "./peaks.js";
import { personalMediaAdapter } from "./personal-media.js";
import { pragprogAdapter } from "./pragprog.js";
import { rutlesAdapter } from "./rutles.js";
import { saiensuAdapter } from "./saiensu.js";
import { seshopAdapter } from "./seshop.js";
import { tatsuZineAdapter } from "./tatsu-zine.js";
import { techbookfestAdapter } from "./techbookfest.js";

export const DEFAULT_PUBLISHERS: readonly PublisherAdapter[] = [
  bookTechAdapter,
  bornDigitalAdapter,
  coronashaAdapter,
  cqPublishingAdapter,
  gihyoAdapter,
  impressBooksAdapter,
  jusePAdapter,
  lambdanoteAdapter,
  manateeAdapter,
  maruzenPublishingAdapter,
  optronicsAdapter,
  oreillyJapanAdapter,
  peaksAdapter,
  personalMediaAdapter,
  pragprogAdapter,
  rutlesAdapter,
  saiensuAdapter,
  seshopAdapter,
  tatsuZineAdapter,
  techbookfestAdapter,
  googleBooksAdapter,
];
