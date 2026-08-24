# Bind authentication sessions to one browser surface

Core stores provider credentials in server-side Authentication Sessions and issues separate opaque, host-only cookies bound to the Student or Admin audience, authorizing every request from current server-owned state; we rejected one shared cross-surface session and parent-domain cookies because a lower-privilege frontend compromise could reuse an Admin session, accepting separate login and logout behavior for a Person who uses both surfaces and persistent session storage that works across Core replicas.
