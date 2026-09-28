import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

// Anmelden per Klick und "Erlauben" (OAuth 2 mit PKCE), wie bei Claude, Zapier und Make.
// Oeffentlicher Client ohne Geheimnis - der Schutz ist PKCE.
export class SmartChatOAuth2Api implements ICredentialType {
	name = 'smartChatOAuth2Api';

	extends = ['oAuth2Api'];

	displayName = 'SmartChat OAuth2 API';

	icon: Icon = { light: 'file:../icons/smartchat.svg', dark: 'file:../icons/smartchat.svg' };

	documentationUrl = 'https://docs.smartchat.marketing/en/api/';

	properties: INodeProperties[] = [
		{ displayName: 'Grant Type', name: 'grantType', type: 'hidden', default: 'pkce' },
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: 'https://mcp.smartchat.marketing/oauth/authorize',
			required: true,
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: 'https://mcp.smartchat.marketing/oauth/token',
			required: true,
		},
		{ displayName: 'Client ID', name: 'clientId', type: 'hidden', default: 'scc_f29750650d047d787487abe8af2e6ff1' },
		{ displayName: 'Client Secret', name: 'clientSecret', type: 'hidden', typeOptions: { password: true }, default: '' },
		{ displayName: 'Scope', name: 'scope', type: 'hidden', default: '' },
		{ displayName: 'Auth URI Query Parameters', name: 'authQueryParameters', type: 'hidden', default: '' },
		{ displayName: 'Authentication', name: 'authentication', type: 'hidden', default: 'body' },
	];
}
