/**
 * The `html` implementation is based on code from the MIT licensed `hono` package.
 * @see https://github.com/honojs/hono/blob/main/src/helper/html/index.ts
 */

export const HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3,
} as const;

type HtmlEscapedCallbackOpts = {
  buffer?: [string];
  phase: (typeof HtmlEscapedCallbackPhase)[keyof typeof HtmlEscapedCallbackPhase];
};

export type HtmlEscapedCallback = (opts: HtmlEscapedCallbackOpts) => Promise<string> | undefined;
export type HtmlEscaped = {
  isEscaped: true;
  callbacks?: HtmlEscapedCallback[];
};

export type HtmlEscapedString = string & HtmlEscaped;

export type StringBuffer = (string | Promise<string>)[];

export type StringBufferWithCallbacks = StringBuffer & {
  callbacks: HtmlEscapedCallback[];
};

export function raw(value: unknown, callbacks?: HtmlEscapedCallback[]): HtmlEscapedString {
  const escapedString = new String(value) as HtmlEscapedString;
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;

  return escapedString;
}

const ESCAPE_REGEX = /[&<>'"]/;

async function stringBufferToString(
  buffer: StringBuffer,
  callbacks: HtmlEscapedCallback[] | undefined,
): Promise<HtmlEscapedString> {
  let str = "";
  callbacks ||= [];
  const resolvedBuffer = await Promise.all(buffer);
  for (let i = resolvedBuffer.length - 1; ; i--) {
    str += resolvedBuffer[i];
    i--;
    if (i < 0) {
      break;
    }

    let r = resolvedBuffer[i];
    if (typeof r === "object") {
      callbacks.push(...((r as HtmlEscapedString).callbacks || []));
    }

    const isEscaped = (r as HtmlEscapedString).isEscaped;
    r = await (typeof r === "object" ? (r as HtmlEscapedString).toString() : r);
    if (typeof r === "object") {
      callbacks.push(...((r as HtmlEscapedString).callbacks || []));
    }

    if ((r as HtmlEscapedString).isEscaped ?? isEscaped) {
      str += r;
    } else {
      const buf = [str];
      escapeToBuffer(r, buf);
      str = buf[0];
    }
  }

  return raw(str, callbacks);
}

function escapeToBuffer(str: string, buffer: StringBuffer): void {
  const match = str.search(ESCAPE_REGEX);
  if (match === -1) {
    buffer[0] += str;
    return;
  }

  let escape;
  let index;
  let lastIndex = 0;

  for (index = match; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34: // "
        escape = "&quot;";
        break;
      case 39: // '
        escape = "&#39;";
        break;
      case 38: // &
        escape = "&amp;";
        break;
      case 60: // <
        escape = "&lt;";
        break;
      case 62: // >
        escape = "&gt;";
        break;
      default:
        continue;
    }

    buffer[0] += str.substring(lastIndex, index) + escape;
    lastIndex = index + 1;
  }

  buffer[0] += str.substring(lastIndex, index);
}

function resolveCallbackSync(str: string | HtmlEscapedString): string {
  const callbacks = (str as HtmlEscapedString).callbacks as HtmlEscapedCallback[];
  if (!callbacks?.length) {
    return str;
  }
  const buffer: [string] = [str];

  callbacks.forEach((c) => c({ phase: HtmlEscapedCallbackPhase.Stringify, buffer }));

  return buffer[0];
}

async function resolveCallback(
  str: string | HtmlEscapedString | Promise<string>,
  phase: (typeof HtmlEscapedCallbackPhase)[keyof typeof HtmlEscapedCallbackPhase],
  preserveCallbacks: boolean,
  buffer?: [string],
): Promise<string> {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!((str as unknown) instanceof Promise)) {
      str = (str as unknown as string).toString(); // HtmlEscapedString object to string
    }
    if ((str as string | Promise<string>) instanceof Promise) {
      str = await (str as unknown as Promise<string>);
    }
  }

  const callbacks = (str as HtmlEscapedString).callbacks as HtmlEscapedCallback[];
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str as string];
  }

  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer }))).then((res) =>
    Promise.all(
      res
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter<string>(Boolean as any)
        .map((str) => resolveCallback(str, phase, false, buffer)),
    ).then(() => (buffer as [string])[0]),
  );

  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  }
  return resStr;
}

export function buildHtml(
  strings: TemplateStringsArray,
  ...values: unknown[]
): HtmlEscapedString | Promise<HtmlEscapedString> {
  const buffer: StringBufferWithCallbacks = [""] as StringBufferWithCallbacks;

  for (let i = 0, len = strings.length - 1; i < len; i++) {
    buffer[0] += strings[i];

    const children = values[i] instanceof Array ? (values[i] as Array<unknown>).flat(Infinity) : [values[i]];
    for (let i = 0, len = children.length; i < len; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const child = children[i] as any;
      if (typeof child === "string") {
        escapeToBuffer(child, buffer);
      } else if (typeof child === "number") {
        (buffer[0] as string) += child;
      } else if (typeof child === "boolean" || child === null || child === undefined) {
        continue;
      } else if (typeof child === "object" && (child as HtmlEscaped).isEscaped) {
        if ((child as HtmlEscapedString).callbacks) {
          buffer.unshift("", child);
        } else {
          const tmp = child.toString();
          if (tmp instanceof Promise) {
            buffer.unshift("", tmp);
          } else {
            buffer[0] += tmp;
          }
        }
      } else if (child instanceof Promise) {
        buffer.unshift("", child);
      } else {
        escapeToBuffer(child.toString(), buffer);
      }
    }
  }
  buffer[0] += strings[strings.length - 1];

  return buffer.length === 1
    ? "callbacks" in buffer
      ? raw(resolveCallbackSync(raw(buffer[0], buffer.callbacks)))
      : raw(buffer[0])
    : stringBufferToString(buffer, buffer.callbacks);
}

export function render(str: HtmlEscapedString | Promise<HtmlEscapedString>): Promise<string> {
  return resolveCallback(str, HtmlEscapedCallbackPhase.Stringify, true);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Promise<string> {
  return render(buildHtml(strings, ...values));
}
