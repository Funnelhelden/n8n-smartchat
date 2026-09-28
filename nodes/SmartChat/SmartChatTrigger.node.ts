import {
	NodeConnectionTypes,
	type IDataObject,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	type IPollFunctions,
} from 'n8n-workflow';
import { authProperty, credentials, loadOptions, smartChatRequest } from './api';

/*
 * SmartChat-Trigger fuer n8n (28.9.2026): dieselben 18 Ausloeser wie bei Zapier und Make.
 * Abfrage-Modus (n8n fragt im eingestellten Takt nach). Schon gemeldete Eintraege merkt sich
 * der Knoten (staticData.gesehen), damit nichts doppelt ausgeloest wird.
 */

interface Quelle {
	pfad: (ctx: IPollFunctions) => string;
	feld: string;
	qs?: (ctx: IPollFunctions) => IDataObject;
	filter?: (x: IDataObject, ctx: IPollFunctions) => boolean;
	schluessel?: (x: IDataObject, ctx: IPollFunctions) => string;
}
const ereignis = (typ: string): Quelle => ({ pfad: () => '/events', feld: 'events', qs: () => ({ type: typ, limit: 100 }) });
const nachrichten = (richtung: 'inbound' | 'outbound', filter?: Quelle['filter']): Quelle => ({
	pfad: () => '/messages', feld: 'messages', qs: () => ({ direction: richtung, limit: 100 }), filter,
});

const EVENTS: Record<string, { name: string; description: string; quelle: Quelle }> = {
	newContact: { name: 'New Contact', description: 'A new contact is added', quelle: { pfad: () => '/contacts', feld: 'contacts', qs: () => ({ limit: 100 }) } },
	optIn: { name: 'Contact Confirmed WhatsApp Opt-In', description: 'A contact confirms the WhatsApp opt-in', quelle: ereignis('optin_confirmed') },
	tagged: {
		name: 'Contact Got Tag', description: 'A contact gets a specific tag',
		quelle: {
			pfad: () => '/contacts/tagged', feld: 'contacts',
			qs: (c) => ({ tag: c.getNodeParameter('tag') as string, limit: 200 }),
			schluessel: (x) => `${x.id as string}-${x.tag_added_at as string}`,
		},
	},
	unsubscribed: { name: 'Contact Unsubscribed', description: 'A contact unsubscribes (e.g. writes STOP)', quelle: ereignis('opted_out') },
	incomingMessage: { name: 'New Incoming WhatsApp Message', description: 'A contact sends you a message', quelle: nachrichten('inbound') },
	keyword: {
		name: 'New Message With Keyword', description: 'An incoming message contains a word',
		quelle: nachrichten('inbound', (x, c) => String(x.text || '').toLowerCase().includes(String(c.getNodeParameter('keyword')).toLowerCase())),
	},
	incomingFile: { name: 'New Incoming File', description: 'A contact sends an image, video, PDF or voice message', quelle: nachrichten('inbound', (x) => Boolean(x.type) && x.type !== 'text') },
	messageSent: { name: 'Message Sent', description: 'SmartChat sends a message', quelle: nachrichten('outbound') },
	delivered: { name: 'Message Delivered', description: 'A WhatsApp message was delivered', quelle: ereignis('delivered') },
	read: { name: 'Message Read', description: 'A contact read a WhatsApp message', quelle: ereignis('read') },
	failed: { name: 'Message Failed', description: 'A message could not be sent', quelle: ereignis('failed') },
	linkClicked: { name: 'Link Clicked', description: 'A contact clicks a link in a message', quelle: ereignis('clicked') },
	aiHandover: { name: 'SmartChat AI Needs a Human', description: 'SmartChat AI hands a conversation over to your team', quelle: ereignis('ai_handover') },
	aiReplied: { name: 'SmartChat AI Replied', description: 'SmartChat AI answers a contact', quelle: nachrichten('outbound', (x) => x.sent_by_ai === true) },
	automationTriggered: {
		name: 'Automation Triggered', description: 'An automation starts for someone',
		quelle: { pfad: (c) => `/automations/${encodeURIComponent(c.getNodeParameter('automationId') as string)}/runs`, feld: 'runs', qs: () => ({ limit: 50 }) },
	},
	newsletterSent: {
		name: 'Newsletter Sent', description: 'A newsletter has been sent',
		quelle: { pfad: () => '/newsletters', feld: 'newsletters', filter: (x) => x.status === 'sent', schluessel: (x) => `${x.id as string}-sent` },
	},
	templateApproved: {
		name: 'Template Approved by WhatsApp', description: 'WhatsApp (Meta) approves a template',
		quelle: { pfad: () => '/templates', feld: 'templates', filter: (x) => x.meta_status === 'approved', schluessel: (x) => `${x.id as string}-approved` },
	},
	templateRejected: {
		name: 'Template Rejected by WhatsApp', description: 'WhatsApp (Meta) rejects a template',
		quelle: { pfad: () => '/templates', feld: 'templates', filter: (x) => x.meta_status === 'rejected', schluessel: (x) => `${x.id as string}-rejected` },
	},
};

const MERKEN_MAX = 2000;

export class SmartChatTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SmartChat Trigger',
		name: 'smartChatTrigger',
		icon: { light: 'file:smartchat.svg', dark: 'file:smartchat.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts the workflow when something happens in SmartChat',
		defaults: { name: 'SmartChat Trigger' },
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials,
		properties: [
			authProperty,
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				required: true,
				default: 'newContact',
				options: Object.entries(EVENTS)
					.map(([value, e]) => ({ name: e.name, value, description: e.description }))
					.sort((a, b) => a.name.localeCompare(b.name)),
			},
			{
				displayName: 'Tag Name or ID', name: 'tag', type: 'options', typeOptions: { loadOptionsMethod: 'getTags' }, required: true, default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				displayOptions: { show: { event: ['tagged'] } },
			},
			{
				displayName: 'Keyword', name: 'keyword', type: 'string', required: true, default: '',
				displayOptions: { show: { event: ['keyword'] } },
			},
			{
				displayName: 'Automation Name or ID', name: 'automationId', type: 'options', typeOptions: { loadOptionsMethod: 'getAutomations' }, required: true, default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				displayOptions: { show: { event: ['automationTriggered'] } },
			},
		],
	};

	methods = { loadOptions };

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event') as string;
		const q = EVENTS[event]!.quelle;
		const r = await smartChatRequest.call(this, 'GET', q.pfad(this), undefined, q.qs ? q.qs(this) : undefined);
		const alle = ((r[q.feld] as IDataObject[]) || []).filter((x) => (q.filter ? q.filter(x, this) : true));
		const key = (x: IDataObject) => (q.schluessel ? q.schluessel(x, this) : String(x.id));

		// Manueller Test: das neueste Beispiel zeigen, nichts merken.
		if (this.getMode() === 'manual') return alle.length ? [this.helpers.returnJsonArray([alle[0]!])] : null;

		const speicher = this.getWorkflowStaticData('node');
		const gesehen = new Set<string>((speicher.gesehen as string[] | undefined) || []);
		const ersterLauf = !speicher.gesehen;
		const neu = alle.filter((x) => !gesehen.has(key(x)));
		speicher.gesehen = [...alle.map(key), ...gesehen].slice(0, MERKEN_MAX);
		// Beim ersten Lauf nur merken, nicht die ganze Vergangenheit ausloesen.
		if (ersterLauf || neu.length === 0) return null;
		return [this.helpers.returnJsonArray(neu.reverse())];
	}
}
