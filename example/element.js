import '../src/my-first-component';

const element = document.createElement('x-1234-my-first-component');
element.incidents = [
	{
		sys_id: 'sample-incident-001',
		number: 'INC1001001',
		short_description: 'VPN access fails after password reset',
		caller_id: {display_value: 'Jordan Avery'},
		priority: {display_value: '2 - High'},
		state: {display_value: 'In Progress'},
		assigned_to: {display_value: 'Casey Morgan'}
	},
	{
		sys_id: 'sample-incident-002',
		number: 'INC1001002',
		short_description: 'Shared printer unavailable on level four',
		caller_id: {display_value: 'Taylor Reed'},
		priority: {display_value: '3 - Moderate'},
		state: {display_value: 'New'},
		assigned_to: ''
	}
];

document.body.appendChild(element);
