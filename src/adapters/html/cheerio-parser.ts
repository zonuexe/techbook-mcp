import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { HtmlParser, HtmlDocument, HtmlElement } from "../../ports/html-parser.js";

class CheerioElement implements HtmlElement {
  constructor(
    private readonly $: cheerio.CheerioAPI,
    private readonly el: Element,
  ) {}

  text(): string {
    return this.$(this.el).text().trim();
  }

  html(): string | null {
    return this.$(this.el).html();
  }

  attr(name: string): string | undefined {
    return this.$(this.el).attr(name);
  }

  find(selector: string): HtmlElement[] {
    return this.$(this.el)
      .find(selector)
      .toArray()
      .map(el => new CheerioElement(this.$, el as Element));
  }
}

class CheerioDocument implements HtmlDocument {
  constructor(private readonly $: cheerio.CheerioAPI) {}

  select(selector: string): HtmlElement[] {
    return this.$(selector)
      .toArray()
      .map(el => new CheerioElement(this.$, el as Element));
  }

  selectOne(selector: string): HtmlElement | null {
    return this.select(selector)[0] ?? null;
  }
}

export class CheerioHtmlParser implements HtmlParser {
  parse(html: string): HtmlDocument {
    const $ = cheerio.load(html);
    return new CheerioDocument($);
  }
}
