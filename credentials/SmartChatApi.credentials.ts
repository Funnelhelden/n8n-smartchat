import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class SmartChatApi implements ICredentialType {
	name = 'smartChatApi';

	displayName = 'SmartChat API';

	icon: Icon = { light: 'file:../icons/smartchat.svg', dark: 'file:../icons/smartchat.svg' };

	documentationUrl = 'https://docs.smartchat.marketing/en/api/';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'Create a key in SmartChat under Settings > API keys. It starts with sk_live_.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.smartchat.marketing/v1',
			url: '/me',
			method: 'GET',
		},
	};
}
