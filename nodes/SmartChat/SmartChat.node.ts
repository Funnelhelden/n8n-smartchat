import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import { authProperty, credentials, gespraechVon, loadOptions, sauber, smartChatRequest } from './api';

/*
 * SmartChat-Aktionen und -Suchen fuer n8n (28.9.2026). Gleiche Liste wie bei Zapier und Make:
 * 23 Aktionen + 5 Suchen + "Make an API Call". Jede Operation steht einmal in OPS:
 * Felder (n8n-Eigenschaften) + was sie ausfuehrt.
 */

type Ausfuehren = (this: IExecuteFunctions, i: number) => Promise<IDataObject | IDataObject[]>;
interface Op {
	resource: string;
	value: string;
	name: string;
	action: string;
	description: string;
	fields: INodeProperties[];
	run: Ausfuehren;
}

const p = (ctx: IExecuteFunctions, name: string, i: number, fallback: unknown = '') =>
	ctx.getNodeParameter(name, i, fallback) as never;

const kontaktFeld: INodeProperties = {
	displayName: 'Contact Name or ID',
	name: 'contactId',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getContacts' },
	required: true,
	default: '',
	description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
};
const text = (name: string, displayName: string, extra: Partial<INodeProperties> = {}): INodeProperties => ({
	displayName,
	name,
	type: 'string',
	default: '',
	...extra,
});
const auswahl = (name: string, displayName: string, methode: string): INodeProperties => ({
	displayName: `${displayName} Name or ID`,
	name,
	type: 'options',
	typeOptions: { loadOptionsMethod: methode },
	required: true,
	default: '',
	description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
});
const limitFeld: INodeProperties = {
	displayName: 'Limit',
	name: 'limit',
	type: 'number',
	typeOptions: { minValue: 1 },
	default: 50,
	description: 'Max number of results to return',
};
const schluesselWerte = (name: string, displayName: string): INodeProperties => ({
	displayName,
	name,
	type: 'fixedCollection',
	typeOptions: { multipleValues: true },
	default: {},
	options: [{ name: 'values', displayName: 'Value', values: [text('key', 'Key'), text('value', 'Value')] }],
});
const alsObjekt = (fc: { values?: Array<{ key: string; value: string }> } | undefined): IDataObject =>
	Object.fromEntries((fc?.values || []).filter((v) => v.key).map((v) => [v.key, v.value]));
const json = (v: unknown): IDataObject => {
	if (!v) return {};
	if (typeof v === 'object') return v as IDataObject;
	return JSON.parse(String(v)) as IDataObject;
};
const app = (ctx: IExecuteFunctions, fn: string, params: IDataObject, body: IDataObject) =>
	smartChatRequest.call(ctx, 'POST', `/app/${fn}`, { params, query: {}, body });
const nachName = async (ctx: IExecuteFunctions, i: number, pfad: string, feld: string) => {
	const name = String(p(ctx, 'name', i)).toLowerCase();
	const alle = ((await smartChatRequest.call(ctx, 'GET', pfad))[feld] as IDataObject[]) || [];
	return alle.filter((x) => String(x.name || '').toLowerCase().includes(name)).slice(0, p(ctx, 'limit', i, 50));
};

const OPS: Op[] = [
	// ---------- Kontakte ----------
	{
		resource: 'contact', value: 'create', name: 'Create', action: 'Create a contact', description: 'Create a new contact',
		fields: [text('name', 'Name'), text('phone', 'Phone (WhatsApp)', { required: true, placeholder: '+4915112345678' })],
		async run(i) {
			const r = await smartChatRequest.call(this, 'POST', '/contacts', sauber({ name: p(this, 'name', i), phone: p(this, 'phone', i) }));
			return (r.contact as IDataObject) || r;
		},
	},
	{
		resource: 'contact', value: 'update', name: 'Update', action: 'Update a contact', description: 'Change name or phone of a contact',
		fields: [kontaktFeld, text('name', 'Name'), text('phone', 'Phone (WhatsApp)')],
		async run(i) {
			const r = await smartChatRequest.call(this, 'PATCH', `/contacts/${encodeURIComponent(p(this, 'contactId', i))}`,
				sauber({ name: p(this, 'name', i), phone: p(this, 'phone', i) }));
			return (r.contact as IDataObject) || r;
		},
	},
	{
		resource: 'contact', value: 'delete', name: 'Delete', action: 'Delete a contact', description: 'Delete a contact and all of its data permanently',
		fields: [kontaktFeld],
		async run(i) {
			return smartChatRequest.call(this, 'DELETE', `/contacts/${encodeURIComponent(p(this, 'contactId', i))}`);
		},
	},
	{
		resource: 'contact', value: 'addTags', name: 'Add Tags', action: 'Add tags to a contact', description: 'Add one or more tags to a contact',
		fields: [kontaktFeld, text('tags', 'Tags', { required: true, description: 'Comma-separated, e.g. vip, newsletter' })],
		async run(i) {
			const tags = String(p(this, 'tags', i)).split(',').map((t) => t.trim()).filter(Boolean);
			return smartChatRequest.call(this, 'POST', `/contacts/${encodeURIComponent(p(this, 'contactId', i))}/tags`, { tags });
		},
	},
	{
		resource: 'contact', value: 'removeTag', name: 'Remove Tag', action: 'Remove a tag from a contact', description: 'Remove a tag from a contact',
		fields: [kontaktFeld, auswahl('tag', 'Tag', 'getTags')],
		async run(i) {
			return smartChatRequest.call(this, 'DELETE',
				`/contacts/${encodeURIComponent(p(this, 'contactId', i))}/tags/${encodeURIComponent(p(this, 'tag', i))}`);
		},
	},
	{
		resource: 'contact', value: 'unsubscribe', name: 'Unsubscribe', action: 'Unsubscribe a contact', description: 'Contact gets no more marketing messages',
		fields: [kontaktFeld],
		async run(i) {
			return app(this, 'unsubscribe_contact', { contact_id: p(this, 'contactId', i) }, {});
		},
	},
	{
		resource: 'contact', value: 'sendOptIn', name: 'Send Opt-In Request', action: 'Send a WhatsApp opt-in request', description: 'Send the WhatsApp opt-in confirmation message',
		fields: [kontaktFeld],
		async run(i) {
			return smartChatRequest.call(this, 'POST', '/tools/resend_optin_confirmation', { arguments: { contact_id: p(this, 'contactId', i) } });
		},
	},
	{
		resource: 'contact', value: 'search', name: 'Search', action: 'Search contacts', description: 'Find contacts by name or phone, sign-up date or opt-in status',
		fields: [
			text('q', 'Name or Phone'),
			{
				displayName: 'Opt-In Status', name: 'optin', type: 'options', default: '',
				options: [
					{ name: 'Any', value: '' }, { name: 'Confirmed', value: 'confirmed' }, { name: 'No Opt-In', value: 'none' },
					{ name: 'Unsubscribed', value: 'opted_out' }, { name: 'Waiting for Confirmation', value: 'pending' },
				],
			},
			{ displayName: 'Signed Up After', name: 'createdAfter', type: 'dateTime', default: '' },
			{ displayName: 'Signed Up Before', name: 'createdBefore', type: 'dateTime', default: '' },
			limitFeld,
		],
		async run(i) {
			const r = await smartChatRequest.call(this, 'GET', '/contacts', undefined, {
				q: p(this, 'q', i), optin: p(this, 'optin', i), created_after: p(this, 'createdAfter', i),
				created_before: p(this, 'createdBefore', i), limit: p(this, 'limit', i, 50),
			});
			return (r.contacts as IDataObject[]) || [];
		},
	},
	// ---------- Nachrichten und Postfach ----------
	{
		resource: 'message', value: 'send', name: 'Send', action: 'Send a WhatsApp message', description: 'Free text, only within 24 hours after the contact last wrote',
		fields: [kontaktFeld, text('text', 'Text', { required: true, typeOptions: { rows: 4 } })],
		async run(i) {
			return smartChatRequest.call(this, 'POST', '/messages', { contact_id: p(this, 'contactId', i), text: p(this, 'text', i) });
		},
	},
	{
		resource: 'message', value: 'sendTemplate', name: 'Send Template', action: 'Send a WhatsApp template', description: 'Send an approved WhatsApp template to a contact who opted in',
		fields: [kontaktFeld, auswahl('templateId', 'Template', 'getTemplates'), schluesselWerte('variables', 'Variables')],
		async run(i) {
			return smartChatRequest.call(this, 'POST', '/messages', {
				contact_id: p(this, 'contactId', i),
				template: { id: p(this, 'templateId', i), variables: alsObjekt(p(this, 'variables', i, {})) },
			});
		},
	},
	{
		resource: 'message', value: 'sendFile', name: 'Send File', action: 'Send an image video or PDF', description: 'Send a file to a contact in their WhatsApp conversation',
		fields: [kontaktFeld, text('fileUrl', 'File URL', { required: true }), text('text', 'Caption', { typeOptions: { rows: 2 } })],
		async run(i) {
			const conv = await gespraechVon.call(this, p(this, 'contactId', i));
			const up = await smartChatRequest.call(this, 'POST', '/media', { url: p(this, 'fileUrl', i), usage: 'chat' });
			const mediaId = ((up.media as IDataObject | undefined)?.id ?? up.id) as string;
			return app(this, 'reply_in_conversation', { conversation_id: conv }, { text: p(this, 'text', i), media_id: mediaId });
		},
	},
	{
		resource: 'message', value: 'reply', name: 'Reply in Inbox', action: 'Reply in the inbox', description: 'Reply in the inbox conversation of a contact',
		fields: [kontaktFeld, text('text', 'Text', { required: true, typeOptions: { rows: 4 } })],
		async run(i) {
			const conv = await gespraechVon.call(this, p(this, 'contactId', i));
			return app(this, 'reply_in_conversation', { conversation_id: conv }, { text: p(this, 'text', i) });
		},
	},
	{
		resource: 'message', value: 'markRead', name: 'Mark as Read', action: 'Mark a conversation as read', description: 'Mark the inbox conversation of a contact as read',
		fields: [kontaktFeld],
		async run(i) {
			const conv = await gespraechVon.call(this, p(this, 'contactId', i));
			return app(this, 'mark_conversation_read', { conversation_id: conv }, {});
		},
	},
	{
		resource: 'message', value: 'setAi', name: 'Switch SmartChat AI', action: 'Switch smartchat AI for a contact', description: 'Let SmartChat AI answer this contact, or only your team',
		fields: [kontaktFeld, { displayName: 'SmartChat AI Answers', name: 'enabled', type: 'boolean', default: true }],
		async run(i) {
			const conv = await gespraechVon.call(this, p(this, 'contactId', i));
			return app(this, 'set_conversation_ai_mode', { conversation_id: conv }, { enabled: p(this, 'enabled', i, true) });
		},
	},
	{
		resource: 'message', value: 'getConversation', name: 'Get Conversation', action: 'Get the conversation of a contact', description: 'Latest messages of the WhatsApp conversation of a contact',
		fields: [kontaktFeld, { ...limitFeld, default: 20 }],
		async run(i) {
			const conv = await gespraechVon.call(this, p(this, 'contactId', i));
			const r = await smartChatRequest.call(this, 'GET', `/inbox/conversations/${encodeURIComponent(conv)}/messages`, undefined, { limit: p(this, 'limit', i, 20) });
			return (r.messages as IDataObject[]) || [];
		},
	},
	// ---------- Automationen ----------
	{
		resource: 'automation', value: 'start', name: 'Start', action: 'Start an automation', description: 'Start a SmartChat automation',
		fields: [auswahl('automationId', 'Automation', 'getAutomations'), schluesselWerte('payload', 'Data')],
		async run(i) {
			const r = await smartChatRequest.call(this, 'POST', `/automations/${encodeURIComponent(p(this, 'automationId', i))}/trigger`,
				{ payload: alsObjekt(p(this, 'payload', i, {})) });
			return (r.run as IDataObject) || r;
		},
	},
	{
		resource: 'automation', value: 'search', name: 'Search', action: 'Search automations', description: 'Find automations by name',
		fields: [text('name', 'Name', { required: true }), limitFeld],
		async run(i) {
			return nachName(this, i, '/automations', 'automations');
		},
	},
	// ---------- Newsletter ----------
	{
		resource: 'newsletter', value: 'create', name: 'Create', action: 'Create a newsletter', description: 'Create a WhatsApp newsletter as a draft',
		fields: [text('subject', 'Name', { required: true }), text('content', 'Text', { required: true, typeOptions: { rows: 6 } })],
		async run(i) {
			const r = await smartChatRequest.call(this, 'POST', '/newsletters',
				{ subject: p(this, 'subject', i), content: p(this, 'content', i), channel: 'whatsapp' });
			return (r.newsletter as IDataObject) || r;
		},
	},
	{
		resource: 'newsletter', value: 'schedule', name: 'Schedule or Send', action: 'Schedule or send a newsletter', description: 'Leave the time empty to send it as soon as possible',
		fields: [auswahl('newsletterId', 'Newsletter', 'getNewsletters'), { displayName: 'Send At', name: 'scheduledAt', type: 'dateTime', default: '' }],
		async run(i) {
			return smartChatRequest.call(this, 'POST', `/newsletters/${encodeURIComponent(p(this, 'newsletterId', i))}/schedule`,
				sauber({ scheduled_at: p(this, 'scheduledAt', i) }));
		},
	},
	{
		resource: 'newsletter', value: 'cancel', name: 'Cancel', action: 'Cancel a scheduled newsletter', description: 'Stop a scheduled newsletter and put it back to draft',
		fields: [auswahl('newsletterId', 'Newsletter', 'getNewsletters')],
		async run(i) {
			return smartChatRequest.call(this, 'POST', `/newsletters/${encodeURIComponent(p(this, 'newsletterId', i))}/cancel`, {});
		},
	},
	{
		resource: 'newsletter', value: 'search', name: 'Search', action: 'Search newsletters', description: 'Find newsletters by name',
		fields: [text('name', 'Name', { required: true }), limitFeld],
		async run(i) {
			return nachName(this, i, '/newsletters', 'newsletters');
		},
	},
	// ---------- Vorlagen ----------
	{
		resource: 'template', value: 'create', name: 'Create', action: 'Create a WhatsApp template', description: 'Create a WhatsApp template as a draft',
		fields: [
			text('name', 'Name', { required: true }),
			text('content', 'Text', { required: true, typeOptions: { rows: 6 } }),
			{
				displayName: 'Language', name: 'language', type: 'options', default: 'de',
				options: ['de', 'en', 'es', 'fr', 'it'].map((l) => ({ name: l.toUpperCase(), value: l })),
			},
		],
		async run(i) {
			const r = await smartChatRequest.call(this, 'POST', '/templates',
				{ name: p(this, 'name', i), content: p(this, 'content', i), language: p(this, 'language', i), channel: 'whatsapp' });
			return (r.template as IDataObject) || r;
		},
	},
	{
		resource: 'template', value: 'submit', name: 'Submit to WhatsApp', action: 'Submit a template to whats app', description: 'Submit a template to WhatsApp (Meta) for approval',
		fields: [auswahl('templateId', 'Template', 'getTemplates')],
		async run(i) {
			const r = await smartChatRequest.call(this, 'POST', `/templates/${encodeURIComponent(p(this, 'templateId', i))}/submit`, {});
			return (r.template as IDataObject) || r;
		},
	},
	{
		resource: 'template', value: 'search', name: 'Search', action: 'Search templates', description: 'Find templates by name',
		fields: [text('name', 'Name', { required: true }), limitFeld],
		async run(i) {
			return nachName(this, i, '/templates', 'templates');
		},
	},
	// ---------- SmartChat AI, Wissen, Medien ----------
	{
		resource: 'ai', value: 'message', name: 'Send Message to SmartChat AI', action: 'Send a message to smartchat AI', description: 'E.g. "Write a newsletter for Friday". Uses credits.',
		fields: [text('message', 'Message', { required: true, typeOptions: { rows: 4 } })],
		async run(i) {
			return smartChatRequest.call(this, 'POST', '/ai/chat', { message: p(this, 'message', i) });
		},
	},
	{
		resource: 'ai', value: 'uploadKnowledge', name: 'Upload Knowledge Document', action: 'Upload a knowledge document', description: 'A document (e.g. price list) that SmartChat AI uses to answer',
		fields: [text('fileUrl', 'File URL', { required: true }), text('filename', 'File Name')],
		async run(i) {
			return smartChatRequest.call(this, 'POST', '/knowledge/documents', sauber({ url: p(this, 'fileUrl', i), filename: p(this, 'filename', i) }));
		},
	},
	{
		resource: 'ai', value: 'uploadMedia', name: 'Upload to Media Library', action: 'Upload to the media library', description: 'Add an image or video to your SmartChat media library',
		fields: [text('fileUrl', 'File URL', { required: true }), text('filename', 'File Name')],
		async run(i) {
			const r = await smartChatRequest.call(this, 'POST', '/media', sauber({ url: p(this, 'fileUrl', i), filename: p(this, 'filename', i) }));
			return (r.media as IDataObject) || r;
		},
	},
	// ---------- Fortgeschritten ----------
	{
		resource: 'advanced', value: 'runFunction', name: 'Run Any SmartChat Function', action: 'Run any smartchat function', description: 'Runs any SmartChat function',
		fields: [
			auswahl('function', 'Function', 'getFunctions'),
			{ displayName: 'Arguments (JSON)', name: 'arguments', type: 'json', default: '{}', description: 'For tools: e.g. {"contact_ID": "..."}. For app functions: {"params": {...}, "body": {...}}.' },
		],
		async run(i) {
			const f = String(p(this, 'function', i));
			const args = json(p(this, 'arguments', i, '{}'));
			if (f.startsWith('app:')) {
				return smartChatRequest.call(this, 'POST', `/app/${encodeURIComponent(f.slice(4))}`,
					{ params: args.params || {}, query: args.query || {}, body: args.body || {} });
			}
			return smartChatRequest.call(this, 'POST', `/tools/${encodeURIComponent(f.replace(/^tool:/, ''))}`, { arguments: args });
		},
	},
	{
		resource: 'advanced', value: 'apiCall', name: 'Make an API Call', action: 'Make an API call', description: 'Any call to the SmartChat API (docs.smartchat.marketing)',
		fields: [
			{
				displayName: 'Method', name: 'method', type: 'options', default: 'GET',
				options: ['DELETE', 'GET', 'PATCH', 'POST', 'PUT'].map((m) => ({ name: m, value: m })),
			},
			text('path', 'Path', { required: true, placeholder: '/contacts', description: 'Relative to https://api.smartchat.marketing/v1' }),
			{ displayName: 'Body (JSON)', name: 'body', type: 'json', default: '{}' },
		],
		async run(i) {
			const methode = p(this, 'method', i, 'GET') as 'GET';
			const pfad = String(p(this, 'path', i)).replace(/^([^/])/, '/$1');
			return smartChatRequest.call(this, methode, pfad, methode === 'GET' || methode === 'DELETE' ? undefined : json(p(this, 'body', i, '{}')));
		},
	},
];

const RESSOURCEN = [
	{ name: 'Advanced', value: 'advanced' },
	{ name: 'Automation', value: 'automation' },
	{ name: 'Contact', value: 'contact' },
	{ name: 'Message', value: 'message' },
	{ name: 'Newsletter', value: 'newsletter' },
	{ name: 'SmartChat AI', value: 'ai' },
	{ name: 'Template', value: 'template' },
];

function eigenschaften(): INodeProperties[] {
	const props: INodeProperties[] = [
		authProperty,
		{ displayName: 'Resource', name: 'resource', type: 'options', noDataExpression: true, options: RESSOURCEN, default: 'contact' },
	];
	for (const r of RESSOURCEN) {
		const ops = OPS.filter((o) => o.resource === r.value).sort((a, b) => a.name.localeCompare(b.name));
		// eslint-disable-next-line n8n-nodes-base/node-param-default-missing
		props.push({
			displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
			displayOptions: { show: { resource: [r.value] } },
			options: ops.map((o) => ({ name: o.name, value: o.value, action: o.action, description: o.description })),
			default: ops[0]!.value,
		});
		for (const o of ops) {
			for (const f of o.fields) {
				props.push({ ...f, displayOptions: { show: { resource: [r.value], operation: [o.value] } } });
			}
		}
	}
	return props;
}

export class SmartChat implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SmartChat',
		name: 'smartChat',
		icon: { light: 'file:smartchat.svg', dark: 'file:smartchat.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'WhatsApp marketing with SmartChat: contacts, messages, newsletters, automations and SmartChat AI',
		defaults: { name: 'SmartChat' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials,
		properties: eigenschaften(),
	};

	methods = { loadOptions };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];
		for (let i = 0; i < items.length; i++) {
			const resource = this.getNodeParameter('resource', i) as string;
			const operation = this.getNodeParameter('operation', i) as string;
			const op = OPS.find((o) => o.resource === resource && o.value === operation);
			try {
				if (!op) throw new NodeOperationError(this.getNode(), `Unknown operation ${resource}/${operation}`, { itemIndex: i });
				const ergebnis = await op.run.call(this, i);
				const liste = Array.isArray(ergebnis) ? ergebnis : [ergebnis];
				for (const e of liste) out.push({ json: e, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				if (error instanceof NodeApiError) throw new NodeApiError(this.getNode(), error as never, { itemIndex: i });
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}
		return [out];
	}
}
