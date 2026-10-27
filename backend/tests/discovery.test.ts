import assert from "node:assert/strict";
import test from "node:test";
import { eventDiscoverySchema } from "../src/modules/events/event-schema.js";
import { encodeEventCursor } from "../src/modules/events/event-pagination.js";
import { personalEventsSchema } from "../src/modules/events/personal-event-routes.js";

test("discovery validates global sorting, filters and matching cursor positions", () => {
  const id = "10000000-0000-4000-8000-000000000001",
    startsAt = "2027-01-01T00:00:00.123456Z";
  for (const sort of ["soonest", "latest", "title-asc", "title-desc"]) {
    const cursor = encodeEventCursor({
      id,
      startsAt,
      sort,
      ...(sort.startsWith("title-") ? { titleKey: "stable title" } : {}),
    });
    const result = eventDiscoverySchema.parse({
      sort,
      cursor,
      tags: "Casual,One-shot",
      timeFrom: "16:00",
      timeTo: "22:00",
      timeZone: "Europe/Belgrade",
      startsBeforeExclusive: "true",
      maxMinimumAge: "18",
    });
    assert.equal(result.afterStartsAt, startsAt);
    assert.equal(result.afterId, id);
    assert.deepEqual(result.tags, ["Casual", "One-shot"]);
    assert.equal(
      eventDiscoverySchema.safeParse({
        cursor,
        sort: sort === "soonest" ? "latest" : "soonest",
      }).success,
      false,
    );
  }
  for (const input of [
    { sort: "rating-desc" },
    { timeFrom: "16:00" },
    { timeFrom: "22:00", timeTo: "16:00", timeZone: "UTC" },
    { timeTo: "25:00", timeZone: "UTC" },
    { tags: "invented" },
    { maxMinimumAge: "-1" },
    { availability: "full", availableOnly: "true" },
    { status: "cancelled" },
    { visibility: "private" },
  ])
    assert.equal(eventDiscoverySchema.safeParse(input).success, false);
  assert.equal(personalEventsSchema.safeParse({ userId: id }).success, false);
  assert.equal(
    personalEventsSchema.safeParse({ relation: "joined", period: "all" })
      .success,
    true,
  );
});
