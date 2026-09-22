# Question

How should Issue #112 inspect and deliver private collection files without reusing public Work media behavior? Sources checked 2026-09-22.

## Conclusion

Specify quarantined inspection and Core-authorized downloads before implementing collection uploads. The existing media service is a storage seam, not a complete private-document safety pipeline.

## Findings

- **Fact:** OWASP recommends layered upload validation, generated storage names, private storage, size limits, and malware inspection. Extensions and client MIME declarations alone are insufficient; archive expansion and parser resource use are attack surfaces. [OWASP File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), page revision date not established.
- **Fact:** `Content-Disposition: attachment` requests downloading rather than inline display. It does not inspect or sanitize content. [MDN Content-Disposition](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Disposition), updated 2026-06-22.
- **Fact:** `X-Content-Type-Options: nosniff` directs browsers to honor the declared MIME type. It is not malware detection. [MDN X-Content-Type-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Content-Type-Options), revision date not established.
- **Local evidence:** `apps/media/src/server.ts` currently limits uploads to `5 * 1_024 * 1_024` bytes, buffers PUT bodies, allows overwrites, and accepts signed GETs without current Account authorization. Only Work variant keys are public. These behaviors cannot alone satisfy the collection contract. ADR 0014 retains self-hosted storage and Core ownership of authorization.

## Showcase implications

**Design recommendation adopted for this specification:** use separate private object namespaces, immutable accepted objects, quarantined inspection, bounded workers, and authenticated streaming downloads through the frontend BFF and Core. Keep storage credentials and signed storage GETs server-side so each new download evaluates current access. This accepts additional streaming traffic through the application boundary.

Use decimal MB for collection limits: 10,000,000 bytes per file and 50,000,000 bytes per submission. This is a collection contract choice, not a change to existing Work media limits. The accepted 24-hour export lifetime is a product decision, separate from source-document retention.

## Unknowns and verification plan

Select and verify the actual malware scanner and format parsers during implementation; no installed capability or clean-file guarantee is claimed. Pin supported versions and document numeric decompression, memory, time, pixel and queue limits before enabling uploads. Test malformed and encrypted documents, active content, archive traversal/expansion, spoofed types, immutable-object races, scanner outages, unauthorized downloads, snapshot races, and expiry. Do not enable production collection until the university retention policy is resolved.

## Sources

- [Upload security guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [Attachment response semantics](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Disposition)
- [MIME sniffing control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Content-Type-Options)
- [ADR 0014](../adr/0014-self-hosted-stateful-infrastructure.md)
