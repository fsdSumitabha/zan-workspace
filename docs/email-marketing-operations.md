# Email marketing: running it

This is the page to open when a campaign is behaving oddly, or when
somebody asks why an email did or did not arrive. It is written for the
person on duty, not for whoever next changes the code.

The design reasoning lives in `EMAIL_MARKETING_ARCHITECTURE.md`. The
choices that shaped this build are in `EMAIL_MARKETING_DECISIONS.md`.

---

## 1. Stop everything, now

There is one switch that stops all sending in a region.

**Email Marketing → Settings → Kill switch.** Turn it on and give a
reason. Every worker checks it before it claims any work, so sending
stops within one worker cycle. Nothing is lost: recipients stay queued
and go out when the switch is turned off.

Use it when you do not yet know what is wrong. It is faster than
deciding, and nothing it does has to be undone.

To stop one campaign only, open the campaign and press **Pause**. To stop
it and never send the rest, press **Cancel**. Cancel is final: the
unsent recipients are marked cancelled and will not be picked up again.

### Paused is not halted

**Paused** means a person pressed pause.

**Halted** means the safety system stopped the campaign because the
provider started refusing mail. The campaign screen shows the reason.
Read it before resuming, because resuming into the same problem makes
the provider's view of us worse, not better.

---

## 2. Reading the Delivery Activity screen

**Email Marketing → Delivery Activity** is every send attempt and what
the mail server replied, kept for 90 days.

The four outcomes:

| Outcome | What happened |
| --- | --- |
| Accepted | The server answered 250. The message was taken. |
| Rejected | The server refused it and said why. |
| Error | The connection failed, timed out, or something else broke. |
| Abandoned | The worker died before it could record the result. |

The error class next to a rejection decides whether it is retried:

| Class | Retried | Typical cause |
| --- | --- | --- |
| Permanent | No | 550, bad address. Retrying cannot help. |
| Temporary | Yes | 421, 451, a timeout, a reset connection. |
| Throttled | Yes | The provider is asking us to slow down. |
| Authentication | No | 535, wrong password. Halts the campaign. |
| Unknown | Yes, fewer times | Nothing matched. Treated cautiously. |

The latency figures at the top say whether the provider is slow or
whether we are. A p95 in the hundreds of milliseconds is normal. A p95
above five seconds means the provider is struggling, and the screen
colours it to say so.

A report links here with the campaign already selected. The blue bar at
the top says so, and there is a link to widen it back to everything.

---

## 3. What "unknown outcome" means

This is the honest answer to a worker that died between the mail server
accepting a message and the database recording that it did.

We genuinely cannot tell whether that email went out.

**The default is never to resend.** Resending risks a duplicate email to
a real person. Not resending risks one person not getting it. Of the
two, the duplicate is the one that damages trust and gets us marked as
spam, so the system chooses the other.

The count is always shown on the report, so nothing is hidden. If the
number is ever more than a handful, that is a signal the workers are
being killed mid-flight, not a signal to change the policy.

The policy can be changed per region in Settings. Think about it before
you do.

---

## 4. Accepted is not delivered

This trips up everybody at least once.

**Accepted** means the mail server answered 250: it took the message.
That is the last thing our code can observe over SMTP.

**Delivered** means the provider later confirmed, by webhook, that the
message reached the mailbox.

Gmail sends no such webhooks. On Gmail the delivered count stays at
zero forever, and that zero means *nobody measured*, not *nothing
arrived*. So every screen and every export shows an em dash and the
sentence "this provider does not report it" instead of 0%.

If you move to a provider that does report deliveries, such as Amazon
SES, the figure starts appearing on new campaigns by itself. Nothing
needs switching on beyond the webhook.

### Opens are approximate, clicks are not

Apple Mail Privacy Protection and corporate image proxies fetch the
tracking pixel with no human involved, which invents opens. Image
blocking hides real ones. Treat the open rate as a direction, not a
measurement.

Clicks are reliable: somebody pressed something.

---

## 5. Reading a report

Every rate on a report names what it is a share of. This is deliberate.
An open rate over accepted mail and an open rate over delivered mail are
different numbers, and the gap between them is exactly the mail that
bounced. A percentage with no stated base is the most common way email
reporting misleads.

`Accepted` counts submitted, delivered and bounced together, because a
delivered or bounced recipient was accepted first; its status simply
moved on later. If accepted counted only "submitted", every rate over it
would drift upwards as deliveries confirmed, which would look like the
campaign improving after it finished.

An unmeasured rate is an em dash. It is never written as 0%.

The **Export** button gives a spreadsheet with six tabs: summary,
recipients, failures, bounces, engagement and delivery attempts. The
caveats above travel inside the file, because a spreadsheet gets
forwarded and read months later with nobody to explain it.

Every value in that file that came from outside — an address, a contact
name, an SMTP response, a link — is written as a text cell, so a value
beginning with `=` is shown rather than run as a formula.

---

## 6. The numbers to set, and what they actually do

**Email Marketing → Settings** holds the delivery settings, per region.
Each field has one sentence of help under it. The ones that matter:

- **Emails per second** and **Emails per day** are the provider's
  limits, not wishes. Set them to what the provider allows.
- **Send concurrency** is how many sends are in flight inside one
  worker. See the measurements below before raising it.
- **Scheduler interval** decides how close to its chosen time a
  scheduled campaign actually goes out. The campaign screen tells people
  the real precision, which is twice this interval.
- **Bounce limit** stops a campaign when that share of sends hard
  bounce, once enough have been sent to be meaningful. Leave it on.

### What the benchmark measured

Run on this project on 19 November 2026, against a remote MongoDB Atlas
cluster, through a mail sink rather than a real provider. 300 recipients
each time, a limit of 10 per second:

| Send concurrency | Wall clock | Throughput | Share of the 10/sec limit |
| --- | --- | --- | --- |
| 2 (the default) | 77.6 s | 3.87/sec | 39% |
| 6 | 40.5 s | 7.42/sec | 74% |
| 10 | 37.0 s | 8.12/sec | 81% |
| 16 | 36.7 s | 8.18/sec | 82% |

A campaign of 100 at the default took 26.7 seconds.

Two things follow.

**The send rate was not the constraint at the default.** At concurrency
2 the run used 39% of the permitted rate. The time went on database
round trips: each recipient costs three writes, and against a remote
cluster those dominate. Raising the permitted rate would have changed
nothing.

**Concurrency stops helping around 10.** Past that the rate limiter
binds, which is what it is for. At a 30 per second limit and concurrency
10 the same 300 took 21.9 seconds at 13.67/sec, so the engine has room
if a provider ever allows more.

No duplicate was ever sent, at any concurrency, including 16. That is
the property that matters most and it held throughout.

### Why the default is still 2

The benchmark sends through a sink, which has no connection limit. Real
SMTP goes through one pooled connection (`maxConnections` is 1 on
purpose, because providers cap connections per account and going over
gets the account throttled). The sends themselves therefore queue, and
only the database work around each send overlaps. The real gain will be
smaller than the table above.

At the planned volume — under 100 recipients — the default finishes a
campaign in under half a minute. There is no problem to fix. Raise send
concurrency only if campaigns grow and the Delivery Activity latency
figures show the provider is *not* the thing slowing it down.

Re-measure rather than guess:

```powershell
npm run email:simulate -- --recipients=300 --concurrency=6
```

It runs against the test database, through a sink, to `.invalid`
addresses. It cannot reach a real person.

---

## 7. Raising the send rate

When the provider changes — a higher Gmail limit, or a move to SES —
change the numbers in Settings, not in the code. No deploy is needed:
the next worker reads the new values.

1. Confirm the new limit in the provider's own documentation.
2. Set **Emails per second** and **Emails per day** to it.
3. Leave send concurrency alone at first. Send one campaign and read the
   report's throughput figure.
4. If throughput is well under the new limit, and Delivery Activity
   shows low latency, raise send concurrency one step and measure again.

Set the rate below the provider's limit, not at it. The limiter is a
backstop, and several warm instances each sending at the limit add up to
more than the limit.

---

## 8. When somebody says they did not get it

In order, because the earlier steps are quicker:

1. **Delivery Activity**, search for the address. If there is an
   attempt, the server's own reply is there and it usually says why.
2. If the attempt was accepted, the mail left here. It is in their spam
   folder, or their server dropped it silently. We cannot see further;
   with Gmail there is no delivery confirmation to check.
3. If there is no attempt at all, they were never sent to. Open the
   campaign and find them in the recipient list. The status says which:
   suppressed, failed, cancelled, or still waiting.
4. If they are **suppressed**, check **Suppression**. The reason is
   recorded: unsubscribed, hard bounced, marked us as spam, added by
   hand, or an invalid address.

A suppression row is never deleted automatically. An unsubscribe is
permanent, and a row that quietly expired would be a legal problem, not
a storage saving. If somebody asks to be put back on, that is a
deliberate act by a person with the right role.

---

## 9. Things that are meant to look like that

- **A scheduled campaign goes out late.** The scheduler runs on an
  interval; it is not a clock. The campaign screen states the real
  precision. This was a deliberate trade to stay within the hosting plan.
- **Delivered is an em dash.** The provider does not report deliveries.
  See section 4.
- **A campaign finished "with failures".** Some recipients failed
  permanently. The report says which and why. This is a normal outcome
  for any list with old addresses in it.
- **Open rate above 100% is impossible here** because unique opens are
  counted per recipient, but a very high open rate usually means a
  privacy proxy, not an unusually popular email.
- **Suppressed recipients are in the total but not in accepted.** They
  were on the list and deliberately not sent to.
