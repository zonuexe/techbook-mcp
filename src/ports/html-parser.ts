export interface HtmlElement {
  text(): string;
  html(): string | null;
  attr(name: string): string | undefined;
  find(selector: string): HtmlElement[];
}

export interface HtmlDocument {
  select(selector: string): HtmlElement[];
  selectOne(selector: string): HtmlElement | null;
}

export interface HtmlParser {
  parse(html: string): HtmlDocument;
}
