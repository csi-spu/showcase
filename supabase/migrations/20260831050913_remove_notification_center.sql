-- Notification delivery is no longer part of the Showcase product surface.
-- Remove the durable projection and its outbox trigger while retaining the
-- generic outbox used by public-cache invalidation and audit workflows.
drop trigger if exists outbox_enqueue_notification_delivery on private.outbox_events;
drop function if exists private.enqueue_notification_delivery();
drop table if exists private.notifications;
drop table if exists private.notification_deliveries;
