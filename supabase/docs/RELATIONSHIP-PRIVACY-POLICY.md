# Klimr — Relationship & Privacy Policy

**Owner:** Gabriel Duran
**Last reconciled against source:** 2026-08-10 (migrations 0233, 0234)
**Enforced by:** `public.may_act_on()`, `public.may_see_connections()`,
`public.may_see_schedule()`, `public.is_blocked_pair()`,
`public.is_muted_by()`, `public.is_restricted_by()`, `public.comment_visible_to()`
<!-- claim:policy-source=0233,0234 -->

This is the authoritative statement of who may do what to whom on Klimr. It exists
because the audit (KCDX-032) found that Klimr *enforced* relationships without ever
having *written down* the rules — so each surface encoded the assumption of
whoever built it, and the surfaces quietly disagreed. Anything that contradicts
this document is a bug in that thing, not a variation.

For auditors: every row below names the function that enforces it, and every one
of those functions is exercised by the checks in §7.

---

## 1. The four relationships

Klimr is **invite-only**, so even "stranger" means a vetted member who was
invited by someone. That materially changes the calculus below — these are not
anonymous internet accounts.

| Term | Meaning |
|---|---|
| **Stranger** | A signed-in member with no relationship to me |
| **Follower** | Someone who follows me. I did not choose them |
| **I follow** | Someone I chose to follow. They may not follow me back |
| **Connection** | A mutual, accepted connection |
| **Blocked** | Either of us has blocked the other. Symmetric and total |

"Follower" and "I follow" are deliberately distinct. A follower arrived without
my consent; someone I follow is a choice I made. Several rules below turn on
exactly that difference.

---

## 2. The permission ladder

The five configurable actions use one ordered ladder rather than a separate
switch per relationship:

```
everyone  ⊃  network  ⊃  following  ⊃  connections
```

| Level | Includes |
|---|---|
| `everyone` | Any signed-in member |
| `network` | Anyone who follows me, anyone I follow, or a connection |
| `following` | Only people I chose — those I follow, plus connections |
| `connections` | Mutual connections only |

`following` sits *below* `network` because it excludes followers I never chose.

**Why a ladder and not fifteen switches.** The completed matrix gave a value per
(action × relationship) — fifteen member-configurable cells. Built literally that
is fifteen toggles in Settings, and a settings page with fifteen toggles is one
nobody reads: people leave the defaults forever, or turn something off and cannot
find it again. Every answer had the same shape — a threshold, not independent
choices — so five dropdowns carry the identical policy.

---

## 3. Configurable actions — the matrix

Default column shows what a member gets before changing anything.

| Action | Stranger | Follower | I follow | Connection | Blocked | Default | Setting |
|---|---|---|---|---|---|---|---|
| **Send me a connection request** | ✅ | ✅ | ✅ | — | ❌ | `everyone` | `who_can_request` |
| **Invite me to a match or team** | ✅ | ✅ | ✅ | ✅ | ❌ | `everyone` | `who_can_invite` |
| **Comment on my posts** | ✅ | ✅ | ✅ | ✅ | ❌ | `everyone` | `who_can_comment` |
| **Message me directly** | ❌ | ✅ | ✅ | ✅ | ❌ | `network` | `who_can_message` |
| **Tag me in a post** | ❌ | ❌ | ✅ | ✅ | ❌ | `following` | `who_can_tag` |

All five are enforced by `may_act_on(actor, subject, action)`.

**A block outranks every setting, in both directions.** No configuration can
re-open a blocked relationship, and the check runs before the ladder is
consulted.

### Why messages default to `network`

Unsolicited direct messages are the most common harassment vector on any social
product. `network` means someone must have followed me, or been followed by me,
or connected — a small deliberate act rather than none. Members who want to be
reachable by anyone can set `everyone`.

### Why tagging defaults to `following`

Tagging puts my name on content I did not write. The rule matches the existing
recap-tagging consent decision: someone I chose to follow may tag me; someone who
merely followed me may not.

---

## 4. Fixed rules — not member-configurable

| Rule | Stranger | Follower | I follow | Connection | Blocked | Enforced by |
|---|---|---|---|---|---|---|
| **See my profile page** | ✅ | ✅ | ✅ | ✅ | ❌ | `profiles_public` + `is_blocked_pair` |
| **Find me in search** | ✅ | ✅ | ✅ | ✅ | ❌ | `is_discoverable_player` (0215) |
| **See my public posts** | ✅ | ✅ | ✅ | ✅ | ❌ | `posts` RLS + `post_visible` (0209) |
| **Follow me** | ✅ | ✅ | ✅ | ✅ | ❌ | `follows` RLS |
| **See my connections list** | ❌ | ❌ | ❌ | ✅ | ❌ | `may_see_connections` |
| **See my upcoming matches** | ❌ | ❌ | ❌ | ✅ | ❌ | `may_see_schedule` |

The last two are restricted deliberately, and they are the two most often
regretted on other products:

- A **visible connections list** lets someone reconstruct who plays with whom.
  After a block, that is a map back to the person who blocked them.
- **Upcoming matches** is a member's location at a known future time. That is the
  single most safety-relevant field Klimr publishes, and it stays with people
  they have mutually agreed to play with.

**Discoverability is not readability.** Being allowed to *read* a profile you were
linked to is a different question from being allowed to *find* someone by typing
part of their name. `is_discoverable_player` answers the second; RLS answers the
first. Conflating them is what let three search surfaces disagree before 0215.

---

## 5. The three lists

Per-member control is delivered as named lists rather than per-person settings.
Five settings × every member ever interacted with is state nobody maintains by
hand; three lists cover the real cases.

| | What the other person experiences | Are they told? | Reversible? |
|---|---|---|---|
| **Mute** | Nothing. They still see and reach me | No | Yes |
| **Restrict** | Their comments on my posts are visible only to them and me, until I approve | No | Yes |
| **Block** | Neither of us sees the other anywhere | No | Yes |

**None of the three tells the other person.** That secrecy is the feature — a
mute the other person can detect is a block with extra steps, and a restriction
they can detect provokes exactly the confrontation it exists to avoid. The RLS
policies on `mutes` and `restrictions` are own-row for the *muter* only; the
muted member cannot read the list they are on.

**Blocking hides past content; it never deletes it.** A blocked member's earlier
comments disappear from my view and return if I unblock. Deleting would be
irreversible and would tear holes in other people's threads.

### What each list touches

| | Feed | Comments | Profile | Search | Messages |
|---|---|---|---|---|---|
| Mute | hidden from muter | hidden from muter | unchanged | unchanged | unchanged |
| Restrict | unchanged | visible only to author + post owner | unchanged | unchanged | unchanged |
| Block | hidden both ways | hidden both ways | 404 both ways | excluded both ways | blocked |

---

## 6. Names

| Field | Visibility | Purpose |
|---|---|---|
| `display_name` | Public | The name a member goes by |
| `nickname` | Public, optional | Shown alongside the display name |
| `first_name`, `last_name` | **Private** | Verification only. Never in `profiles_public` |

A member's legal name is captured for verification and never appears on a member
surface — not to connections, not on a tournament roster, not in search.

---

## 7. How to audit this

Every claim above is checkable from the SQL editor.

```sql
-- The ladder, for one member against each relationship.
select public.may_act_on('<actor>', '<subject>', 'message');

-- Defaults in force for a member.
select who_can_request, who_can_invite, who_can_comment, who_can_message, who_can_tag
  from public.profiles where id = '<member>';

-- Fixed rules.
select public.may_see_connections('<viewer>', '<subject>');
select public.may_see_schedule('<viewer>', '<subject>');

-- Blocks are symmetric and outrank settings.
select public.is_blocked_pair('<a>', '<b>');
select public.social_invariants_intact();     -- no blocked pair holds a graph edge

-- The lists.
select public.is_muted_by('<viewer>', '<author>');
select public.is_restricted_by('<owner>', '<commenter>');
select public.comment_visible_to('<comment>', '<viewer>');

-- Legal name is not published.
select count(*) from information_schema.columns
 where table_name = 'profiles_public' and column_name in ('first_name', 'last_name');
 -- must be 0
```

`select * from public.klimr_readiness();` runs the boundary checks that back
these rules on every deploy and in CI.

---

## 8. Changing this policy

Change this document and the migration together, in the same commit. A policy
that lives in two places diverges — which is the condition KCDX-032 recorded, and
the reason this file exists.

Adding a new surface that touches relationships means calling `may_act_on()`
rather than writing the check inline. Every inline copy is a place the policy can
drift, and this codebase has already paid for that lesson four separate times
(`is_blocked_pair` was inlined in four policies because it lacked one grant).
