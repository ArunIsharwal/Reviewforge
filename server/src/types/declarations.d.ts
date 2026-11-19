declare module 'express' {
  import * as http from 'http';

  export interface Request extends http.IncomingMessage {
    params: Record<string, string>;
    query: Record<string, string | string[] | undefined>;
    body: any;
    headers: http.IncomingHttpHeaders;
    user?: any;
    originalUrl: string;
    path: string;
    method: string;
    ip?: string;
  }

  export interface Response extends http.ServerResponse {
    statusCode: number;
    status(code: number): this;
    json(body: any): this;
    send(body: any): this;
    setHeader(name: string, value: number | string | readonly string[]): this;
    end(cb?: () => void): this;
  }

  export type NextFunction = (err?: any) => void;

  export type RequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction
  ) => any;

  export type ErrorRequestHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
  ) => any;

  export interface Router {
    use(...handlers: (RequestHandler | ErrorRequestHandler | Router)[]): this;
    use(path: string, ...handlers: (RequestHandler | ErrorRequestHandler | Router)[]): this;
    get(path: string, ...handlers: RequestHandler[]): this;
    post(path: string, ...handlers: RequestHandler[]): this;
    patch(path: string, ...handlers: RequestHandler[]): this;
    put(path: string, ...handlers: RequestHandler[]): this;
    delete(path: string, ...handlers: RequestHandler[]): this;
  }

  export interface Express extends Router {
    listen(port: number | string, callback?: () => void): http.Server;
    listen(port: number | string, host: string, callback?: () => void): http.Server;
  }

  function express(): Express;
  namespace express {
    export interface Application extends Express {}
    export function json(options?: any): RequestHandler;
    export function urlencoded(options?: any): RequestHandler;
    export function Router(options?: any): Router;
  }

  export default express;
}

declare module 'cors' {
  import { RequestHandler } from 'express';
  interface CorsOptions {
    origin?: any;
    methods?: string | string[];
    allowedHeaders?: string | string[];
    exposedHeaders?: string | string[];
    credentials?: boolean;
    maxAge?: number;
    preflightContinue?: boolean;
    optionsSuccessStatus?: number;
  }
  function cors(options?: CorsOptions): RequestHandler;
  export default cors;
}
