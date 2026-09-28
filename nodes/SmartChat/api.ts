import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export const API = 'https://api.smartchat.marketing/v1';

type Ctx = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

/** Ein Aufruf an die SmartChat-API mit der gewaehlten Anmeldung (API-Schluessel oder OAuth). */
export async function smartChatRequest(
	this: Ctx,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
): Promise<IDataObject> {
	const art = (this.getNodeParameter('authentication', 0, 'oAuth2') as string) === 'apiKey' ? 'smartChatApi' : 'smartChatOAuth2Api';
	const options: IHttpRequestOptions = {
		method,
		url: `${API}${path}`,
		json: true,
		headers: { Accept: 'application/json' },
		...(qs ? { qs: sauber(qs) } : {}),
		...(body !== undefined ? { body } : {}),
	};
	try {
		return (await this.helpers.httpRequestWithAuthentication.call(this, art, options)) as IDataObject;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as never);
	}
}

/** Leere Felder nicht mitschicken. */
export function sauber(o: IDataObject): IDataObject {
	const out: IDataObject = {};
	for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') out[k] = v;
	return out;
}

/** Gespraech (Postfach) eines Kontakts - fuer Antworten, Dateien, AI an/aus. */
export async function gespraechVon(this: IExecuteFunctions, contactId: string): Promise<string> {
	const r = await smartChatRequest.call(this, 'GET', '/inbox/conversations', undefined, { limit: 100 });
	const convs = (r.conversations as IDataObject[]) || [];
	const conv = convs.find((c) => ((c.contact as IDataObject | undefined)?.id ?? c.contact_id) === contactId);
	if (!conv) throw new NodeOperationError(this.getNode(), 'This contact has no WhatsApp conversation yet.');
	return conv.id as string;
}

/** Auswahllisten */
async function liste(this: ILoadOptionsFunctions, pfad: string, feld: string, qs?: IDataObject): Promise<IDataObject[]> {
	const r = await smartChatRequest.call(this, 'GET', pfad, undefined, qs);
	return (r[feld] as IDataObject[]) || [];
}
export const loadOptions = {
	async getContacts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		return (await liste.call(this, '/contacts', 'contacts', { limit: 200 })).map((c) => ({
			name: `${(c.name as string) || 'No name'} (${(c.phone as string) || '-'})`,
			value: c.id as string,
		}));
	},
	async getTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		return (await liste.call(this, '/templates', 'templates')).map((t) => ({
			name: `${t.name as string}${t.language ? ` (${t.language as string})` : ''}${t.sendable ? '' : ' [not sendable yet]'}`,
			value: t.id as string,
		}));
	},
	async getAutomations(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		return (await liste.call(this, '/automations', 'automations')).map((a) => ({ name: a.name as string, value: a.id as string }));
	},
	async getNewsletters(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		return (await liste.call(this, '/newsletters', 'newsletters')).map((n) => ({
			name: `${n.name as string} (${n.status as string})`,
			value: n.id as string,
		}));
	},
	async getTags(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		return (await liste.call(this, '/contacts/tags', 'tags')).map((t) => ({ name: t.name as string, value: t.name as string }));
	},
	async getFunctions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		const tools = (await liste.call(this, '/tools', 'tools'))
			.filter((t) => t.allowed)
			.map((t) => ({ name: `${t.name as string}${t.costs_credits ? ' (uses credits)' : ''}`, value: `tool:${t.name as string}` }));
		const funcs = (await liste.call(this, '/app', 'functions'))
			.filter((f) => f.allowed)
			.map((f) => ({ name: (f.title as string) || (f.name as string), value: `app:${f.name as string}` }));
		return [...tools, ...funcs].sort((a, b) => a.name.localeCompare(b.name));
	},
};

export const authProperty = {
	displayName: 'Authentication',
	name: 'authentication',
	type: 'options' as const,
	options: [
		{ name: 'OAuth2 (Recommended)', value: 'oAuth2' },
		{ name: 'API Key', value: 'apiKey' },
	],
	default: 'oAuth2',
};

export const credentials = [
	{ name: 'smartChatOAuth2Api', required: true, displayOptions: { show: { authentication: ['oAuth2'] } } },
	{ name: 'smartChatApi', required: true, displayOptions: { show: { authentication: ['apiKey'] } } },
];
