# Security

## Reporting

Open a private security advisory through the repository's Security tab, or
email the maintainer. Please do not open a public issue for anything
exploitable.

## What this software handles

Deal Room reads private group chats and stores them. That has consequences
worth stating plainly:

- **Your database holds other people's messages.** Names, handles, email
  addresses they typed, and whatever they said. Treat it as you would any
  store of other people's correspondence.
- **Your database holds live API credentials.** An X access token, your XChat
  PIN, a model key. They are encrypted at rest with `CREDENTIALS_SECRET`,
  which lives in `.env` and never in the database — so a stolen database dump
  is not enough to use them, but a stolen dump plus that file is.
- **The XChat PIN unlocks all your X DMs, not just the group you track.**
  That is what decryption requires. It is stored encrypted, is sent to no
  service, and Settings has a button to forget it.
- **Extraction sends message text to a model provider** once you add a key.
  Leave it unset and messages are captured but never sent anywhere.
- **Nothing is proxied through anyone else.** Every API call goes from your
  instance to the provider on your own credentials. No third party sits in the
  middle, and nobody else's key is involved.
- **Nothing is shared between instances.** Each person runs their own, against
  their own database.

Read chats you are a participant in. This reads what your own logged-in
browser can already see, which is not the same as having permission to
retain and process it.

## Phone numbers

A WhatsApp group identifies people by phone number, and anyone in it who is not
in your contacts appears as theirs. An exported chat therefore contains the
personal phone numbers of everybody in the group, and importing one puts them
in your database.

That is a heavier thing to hold than an X handle. It is worth being deliberate
about which groups you import, and about who can reach the machine the database
runs on.
