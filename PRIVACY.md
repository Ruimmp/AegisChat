# Privacy Policy

**Project:** AegisChat — https://github.com/Ruimmp/AegisChat
**Last updated:** 17 September 2026

AegisChat is a Discord moderation bot that detects and removes image-based scam posts. This policy describes what it processes, what it stores, for how long, and how to request deletion.

The bot itself is private. There is no invite link and no public instance: a single instance runs on [Discloud](https://discloud.com), inside one Discord server that I own and moderate. Only the source code is public, under the MIT licence. This policy covers that instance.

## What triggers processing

The bot only reacts to the `messageCreate` gateway event, and only for messages that satisfy **all** of the following:

- the author is not a bot;
- the message was posted in the single guild configured via `GUILD_ID`;
- the message carries **2 or more image attachments**.

Anything else is discarded in memory immediately, before any download, hash lookup, analysis or write. **Text-only messages are never analysed and never stored.** The bot has no commands, no profiling, no analytics, and no advertising.

## What is processed

For a message that passes the gate above:

| Data                      | Purpose                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Image attachments         | Downloaded into memory, hashed (SHA-256 + perceptual hash) and compared against the local database of known scam images. |
| Message text              | Passed as secondary context to the classifier alongside the images. The verdict is driven by the visual content.         |
| Account age of the author | Used as a heuristic signal only. Not stored.                                                                             |

## What is stored, and where

All storage lives inside the Discloud container that runs the bot. Nothing is sold, and nothing is shared with any third party beyond the two listed under "Third parties" below.

**1. Scam image database (`aegis.db`, SQLite)**

Written **only** when an image has been confirmed as a scam. Per record: the image's SHA-256 hash, its perceptual hash, the originating Discord CDN URL, and a timestamp. This is the detection cache. It is what lets a repost be blocked instantly without another AI call.

**2. Learned image archive (`learned-images/`)**

A copy of the image file itself, for images confirmed as scams, named by its SHA-256 hash. It exists so the detection knowledge survives loss of the database, since the stored CDN URL is a signed link that expires.

**3. Pending queue (`aegis.db`, SQLite)**

If the AI provider is rate-limited, the image URLs awaiting analysis are queued and retried every 5 minutes. Entries are removed once processed.

**4. Moderation log (inside Discord)**

When a message scores at or above the review threshold, an embed is posted to a private, moderator-only channel in the same guild. It contains the author's tag and user ID, the message text truncated to 500 characters, the confidence score and the reason. This data stays on Discord and is subject to Discord's own retention; it is not copied off-platform.

**5. Runtime console logs**

Transient operational logs inside the Discloud container, which may include an author tag and a truncated message excerpt. They are not persisted by the application; retention follows Discloud's own log handling.

**Never stored off-platform:** message text, user IDs, usernames, message history, behavioural profiles, or any image that was not confirmed as a scam.

## Third parties

**Discloud** hosts the bot. The database, the image archive and the runtime logs described above sit on their infrastructure and are subject to their terms.

**OpenRouter** performs the classification. Images that the local database does not recognise are sent, together with the message text as context, to the [OpenRouter](https://openrouter.ai) API for a single call, which returns a JSON verdict from the model configured in `OPENROUTER_MODEL`.

- The data is sent for **classification only**. It is never used to train or fine-tune any model, and never for any purpose other than the scam verdict.
- OpenRouter and the underlying model provider handle the request under their own policies. Free-tier models in particular may permit the provider to retain prompt data; `OPENROUTER_MODEL` can be pointed at a paid or no-logging model where that matters.

## Retention

Records in the scam image database and files in the learned image archive are retained **indefinitely by design**. Their entire purpose is persistence: a scam image reposted months later must still be recognised without a fresh AI call. These records contain only confirmed scam material, hashes, the scam image itself, and the expired CDN URL it came from.

Pending queue entries are transient. Moderation log embeds live in Discord and can be deleted there by the server's moderators at any time.

## Legal basis and opt-out

The bot operates as a server-wide safety measure, in the legitimate interest of protecting members from fraud. It applies uniformly to every post containing 2 or more images, in the same way as a spam filter.

There is no per-user opt-out, because there is no per-user dataset to opt out of: no user identifiers, profiles, message history or behavioural data are recorded off-platform. Users who do not wish to be subject to the filter can choose not to post multi-image messages in the guild, or leave it.

## Requesting deletion

Any stored item can be removed on request. To ask for removal, or to report an image that was flagged in error:

- contact me or a moderator inside the server where the bot runs

Removal is a single documented command:

```bash
npm run unscam            # lists every stored hash, with date and source URL
npm run unscam -- <hash>  # deletes the database record and the archived image file
```

Requests are actioned manually on receipt.

## Security

Data is stored inside the Discloud container that runs the bot, reachable only by me. The SQLite database and the image archive are not encrypted at the application level; they contain no personal data, only hashes and copies of confirmed scam images. API credentials are supplied through environment variables and are never written to the database or to the archive.

## Children

The bot is not directed at children and collects no data intended to identify any individual. Use of Discord is subject to Discord's own minimum age requirements.

## Changes

Changes to this policy are published in this file, in the public repository, with the "Last updated" date above.

## Contact

Open an issue at https://github.com/Ruimmp/AegisChat/issues
