# n8n-nodes-smartchat

Official [n8n](https://n8n.io) nodes for [SmartChat](https://smartchat.marketing).

SmartChat is a WhatsApp marketing platform for small businesses: collect contacts, send newsletters and automations, and let SmartChat AI answer your customers.

## Installation

In n8n: **Settings > Community Nodes > Install** and enter `n8n-nodes-smartchat`.
See the [n8n community nodes guide](https://docs.n8n.io/integrations/community-nodes/installation/).

## Credentials

Two ways to connect:

- **OAuth2 (recommended, n8n Cloud):** click *Connect*, sign in to SmartChat and allow access. No key needed.
- **API Key (self-hosted n8n):** create a key in SmartChat under *Settings > API keys* (starts with `sk_live_`) and paste it into the *SmartChat API* credential.

You can disconnect at any time in SmartChat under *Settings > API keys*.

## SmartChat Trigger

Starts a workflow when something happens in SmartChat:

New Contact · Contact Confirmed WhatsApp Opt-In · Contact Got Tag · Contact Unsubscribed · New Incoming WhatsApp Message · New Message With Keyword · New Incoming File · Message Sent · Message Delivered · Message Read · Message Failed · Link Clicked · SmartChat AI Needs a Human · SmartChat AI Replied · Automation Triggered · Newsletter Sent · Template Approved by WhatsApp · Template Rejected by WhatsApp

## SmartChat node

| Resource | Operations |
|---|---|
| Contact | Create, Update, Delete, Add Tags, Remove Tag, Unsubscribe, Send Opt-In Request, Search |
| Message | Send, Send Template, Send File, Reply in Inbox, Mark as Read, Switch SmartChat AI, Get Conversation |
| Automation | Start, Search |
| Newsletter | Create, Schedule or Send, Cancel, Search |
| Template | Create, Submit to WhatsApp, Search |
| SmartChat AI | Send Message to SmartChat AI (uses credits), Upload Knowledge Document, Upload to Media Library |
| Advanced | Run Any SmartChat Function, Make an API Call |

WhatsApp rules apply: free-text messages only within 24 hours after the contact last wrote; outside that window use an approved template. Marketing only goes to contacts who confirmed the opt-in.

## Resources

- [SmartChat API documentation](https://docs.smartchat.marketing/en/api/)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE.md)
