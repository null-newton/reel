import { ProxyService, OMSSError } from '@omss/framework';

/**
 * Fix for @omss/framework's ProxyService.handleBufferedRequest: it treats every `text/*`
 * response as a manifest and decodes it as UTF-8. Some CDNs (e.g. VixSrc's) serve binary
 * HLS segments as `text/html`, so the segments get corrupted (U+FFFD everywhere) and the
 * player shows 00:00 / 00:00.
 *
 * Same logic as the framework's version, except a response is only rewritten as a manifest
 * when its body actually looks like one (`#EXTM3U` for HLS, `<` for DASH/XML).
 */
const DEFAULT_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.6912.95 Safari/537.36';

function looksLikeManifest(body: Buffer): boolean {
    let head = body.subarray(0, 64).toString('utf-8');
    if (head.charCodeAt(0) === 0xfeff) head = head.slice(1);
    head = head.trimStart();
    return head.startsWith('#EXTM3U') || head.startsWith('<');
}

export function applyProxyFix() {
    const proto = ProxyService.prototype as any;
    if (proto.__cineproFixed) return;
    proto.__cineproFixed = true;

    proto.handleBufferedRequest = async function (proxyData: { url: string; headers?: Record<string, string> }) {
        const response: Response = await this.fetchWithTimeout(proxyData.url, {
            method: 'GET',
            headers: {
                ...(proxyData.headers ?? {}),
                'User-Agent': proxyData.headers?.['User-Agent'] ?? DEFAULT_UA,
            },
        });
        if (response.status >= 500) {
            throw new OMSSError('INTERNAL_ERROR', `Upstream returned ${response.status}`, response.status, {
                url: proxyData.url,
            });
        }

        const contentType = response.headers.get('content-type') ?? '';
        let responseData = Buffer.from(await response.arrayBuffer());
        let isBinary = false;

        if (this.isManifestFile(contentType, proxyData.url)) {
            if (looksLikeManifest(responseData)) {
                const rewritten = this.rewriteManifest(responseData.toString('utf-8'), proxyData.url, proxyData.headers);
                responseData = Buffer.from(rewritten, 'utf-8');
            } else {
                isBinary = true; // mislabelled binary (e.g. TS segment served as text/html)
            }
        }

        const headersOut: Record<string, string> = {
            'Content-Disposition': 'inline',
            'Accept-Ranges': 'bytes',
            'Cache-Control': response.headers.get('cache-control') ?? 'public, max-age=7200',
            'Content-Length': String(responseData.length),
        };
        const contentRange = response.headers.get('content-range');
        if (contentRange) headersOut['Content-Range'] = contentRange;

        return {
            data: responseData,
            contentType: isBinary ? 'application/octet-stream' : contentType || this.getMimeType(proxyData.url),
            statusCode: response.status,
            headers: headersOut,
        };
    };
}
