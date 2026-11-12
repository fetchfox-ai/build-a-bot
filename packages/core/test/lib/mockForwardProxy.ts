import http from 'node:http';

type RecordedRequest = {
  authorization: string | undefined;
  path: string;
};

export const startMockForwardProxy = async (username: string, password: string) => {
  const requests: RecordedRequest[] = [];
  const expectedAuthorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const server = http.createServer((req, resp) => {
    const authorization = req.headers['proxy-authorization'];
    if (authorization !== expectedAuthorization) {
      resp.writeHead(407, { 'proxy-authenticate': 'Basic realm="Fetchfox"' });
      resp.end();
      return;
    }

    let target: URL;
    try {
      target = new URL(req.url || '');
    } catch {
      resp.writeHead(400);
      resp.end();
      return;
    }
    requests.push({ authorization, path: target.pathname });
    const headers = { ...req.headers, host: target.host };
    delete headers.connection;
    delete headers['proxy-authorization'];
    const targetReq = http.request(
      {
        hostname: target.hostname,
        port: target.port || 80,
        path: `${target.pathname}${target.search}`,
        method: req.method,
        headers,
      },
      (targetResp) => {
        resp.writeHead(targetResp.statusCode || 502, targetResp.headers);
        targetResp.pipe(resp);
      }
    );
    targetReq.on('error', () => {
      if (!resp.headersSent) {
        resp.writeHead(502);
      }
      resp.end();
    });
    req.pipe(targetReq);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (e: Error) => {
      server.off('listening', onListening);
      reject(e);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Mock forward proxy did not bind to a TCP port');
  }

  return {
    server: `http://127.0.0.1:${address.port}`,
    requestCount(path?: string) {
      return path === undefined
        ? requests.length
        : requests.filter((request) => request.path === path).length;
    },
    resetRequests() {
      requests.length = 0;
    },
    async close() {
      if (!server.listening) {
        return;
      }
      await new Promise<void>((resolve, reject) => {
        server.close((e) => (e ? reject(e) : resolve()));
      });
    },
  };
};
