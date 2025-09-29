import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { format as utilFormat } from "node:util";

type LogLevel = "info" | "warn" | "error" | "debug";

const LOG_DIR = join(process.cwd(), "log");
const LOG_FILE = createLogFilePath();

function createLogFilePath(): string {
  mkdirSync(LOG_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return join(LOG_DIR, `${timestamp}.log`);
}

function formatMessage(level: LogLevel, message: unknown, ...rest: unknown[]): string {
  const time = new Date().toISOString();
  const formatted = utilFormat(message as string, ...rest);
  return `[${time}] [${level.toUpperCase()}] ${formatted}`;
}

function writeToFile(line: string): void {
  appendFileSync(LOG_FILE, `${line}\n`);
}

export interface Logger {
  info(message: unknown, ...rest: unknown[]): void;
  warn(message: unknown, ...rest: unknown[]): void;
  error(message: unknown, ...rest: unknown[]): void;
  debug(message: unknown, ...rest: unknown[]): void;
  child(context: Record<string, unknown>): Logger;
}

class LoggerImpl implements Logger {
  constructor(private readonly context: Record<string, unknown> = {}) {}

  info(message: unknown, ...rest: unknown[]): void {
    this.log("info", message, ...rest);
  }

  warn(message: unknown, ...rest: unknown[]): void {
    this.log("warn", message, ...rest);
  }

  error(message: unknown, ...rest: unknown[]): void {
    this.log("error", message, ...rest);
  }

  debug(message: unknown, ...rest: unknown[]): void {
    if (process.env.NODE_ENV === "production" && process.env.DEEPSEARCH_LOG_LEVEL !== "debug") {
      return;
    }
    this.log("debug", message, ...rest);
  }

  child(context: Record<string, unknown>): Logger {
    return new LoggerImpl({ ...this.context, ...context });
  }

  private log(level: LogLevel, message: unknown, ...rest: unknown[]): void {
    const contextPrefix = this.formatContext();
    const fullMessage = contextPrefix ? `${contextPrefix} ${message}` : message;
    const line = formatMessage(level, fullMessage, ...rest);

    switch (level) {
      case "info":
        console.info(line);
        break;
      case "warn":
        console.warn(line);
        break;
      case "error":
        console.error(line);
        break;
      default:
        console.debug(line);
        break;
    }

    try {
      writeToFile(line);
    } catch (error) {
      console.error("写入日志文件失败", error);
    }
  }

  private formatContext(): string {
    const entries = Object.entries(this.context);
    if (entries.length === 0) {
      return "";
    }

    return entries.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(" ");
  }
}

export const logger: Logger = new LoggerImpl();
