import {createCustomElement} from '@servicenow/ui-core';
import snabbdom from '@servicenow/ui-renderer-snabbdom';
import styles from './styles.scss';

const userFilter = 'DYNAMIC90d1921e5f510100a9ad2572f2b477fe';
const teamFilter = 'DYNAMICd6435e965f510100a9ad2572f2b47744';
const listLimit = 500;

const getUserToken = () => {
	try {
		return window.g_ck || window.parent.g_ck || window.top.g_ck || '';
	} catch (error) {
		return '';
	}
};

const fetchTableRecords = async (table, query, fields, userToken) => {
	const records = [];
	let offset = 0;

	while (true) {
		const params = new URLSearchParams({
			sysparm_query: query,
			sysparm_fields: fields,
			sysparm_limit: String(listLimit),
			sysparm_offset: String(offset),
			sysparm_display_value: 'all'
		});
		const response = await fetch(`/api/now/table/${table}?${params.toString()}`, {
			credentials: 'same-origin',
			headers: {
				Accept: 'application/json',
				'X-UserToken': userToken
			}
		});

		if (!response.ok) throw new Error(`Unable to read ${table} (${response.status}).`);

		const payload = await response.json();
		const batch = Array.isArray(payload.result) ? payload.result : [];
		records.push(...batch);
		if (batch.length < listLimit) break;
		offset += listLimit;
	}

	return records;
};

const loadOverviewData = async ({updateState}) => {
	updateState({dataLoading: true, dataError: null});

	try {
		const userToken = getUserToken();
		if (!userToken) throw new Error('No ServiceNow session token is available.');
		const definitions = {
			myIncidents: ['incident', `active=true^assigned_to${userFilter}`, 'sys_id,number,short_description,priority,state,assigned_to,assignment_group'],
			myCatalogTasks: ['sc_task', `active=true^assigned_to${userFilter}`, 'sys_id,number,short_description,state,assigned_to,assignment_group'],
			teamUnassignedIncidents: ['incident', `active=true^assignment_group${teamFilter}^assigned_toISEMPTY`, 'sys_id,number,short_description,priority,state,assigned_to,assignment_group'],
			teamAssignedIncidents: ['incident', `active=true^assignment_group${teamFilter}^assigned_toISNOTEMPTY`, 'sys_id,number,short_description,priority,state,assigned_to,assignment_group'],
			teamUnassignedCatalogTasks: ['sc_task', `active=true^assignment_group${teamFilter}^assigned_toISEMPTY`, 'sys_id,number,short_description,state,assigned_to,assignment_group'],
			teamAssignedCatalogTasks: ['sc_task', `active=true^assignment_group${teamFilter}^assigned_toISNOTEMPTY`, 'sys_id,number,short_description,state,assigned_to,assignment_group'],
			teamApprovalRequests: ['sysapproval_approver', `approver${userFilter}^state=requested`, 'sys_id,sysapproval,state,approver']
		};
		const entries = await Promise.all(Object.entries(definitions).map(async ([key, [table, query, fields]]) => [
			key,
			await fetchTableRecords(table, query, fields, userToken)
		]));
		const liveData = Object.fromEntries(entries);
		const taskIds = new Set();
		Object.values(liveData).flat().forEach(record => {
			const sysId = referenceId(record.sys_id);
			const approvalTaskId = referenceId(record.sysapproval);
			if (sysId) taskIds.add(sysId);
			if (approvalTaskId) taskIds.add(approvalTaskId);
		});
		const taskSlaBatches = await Promise.all(Array.from(taskIds).reduce((batches, taskId, index) => {
			const batchIndex = Math.floor(index / 50);
			batches[batchIndex] ||= [];
			batches[batchIndex].push(taskId);
			return batches;
		}, []).map(ids => fetchTableRecords(
			'task_sla',
			`active=true^taskIN${ids.join(',')}`,
			'sys_id,task,stage,has_breached,sla,planned_end_time',
			userToken
		)));
		liveData.taskSlas = taskSlaBatches.flat();
		updateState({liveData, dataLoading: false, dataError: null});
	} catch (error) {
		updateState({dataLoading: false, dataError: error.message || 'Live records could not be loaded.'});
	}
};

const readRecords = value => {
	if (Array.isArray(value)) return value;
	if (value && Array.isArray(value.result)) return value.result;
	if (value && Array.isArray(value.data)) return value.data;
	return [];
};

const displayValue = value => {
	if (value === null || value === undefined || value === '') return '';
	if (typeof value === 'object') return value.display_value || value.displayValue || value.value || '';
	return String(value);
};

const referenceId = value => {
	if (value && typeof value === 'object') return value.value || value.sys_id || '';
	return value || '';
};

const groupTickets = (tickets, getLabel, getTone) => {
	const groups = new Map();
	tickets.forEach(ticket => {
		const label = getLabel(ticket) || 'Other';
		if (!groups.has(label)) groups.set(label, []);
		groups.get(label).push(ticket);
	});
	return Array.from(groups, ([label, groupedTickets]) => ({
		label,
		count: groupedTickets.length,
		tone: getTone(label),
		sla: groupedTickets.map(ticket => ticket.sla).filter(Boolean).join(' · ') || 'No SLA data',
		tickets: groupedTickets
	}));
};

const createSections = properties => {
	const taskSlas = readRecords(properties.taskSlas);
	const normalize = (records, type) => readRecords(records).map(record => {
		const sysId = referenceId(record.sys_id);
		const taskId = type === 'Approval request' ? referenceId(record.sysapproval) || sysId : sysId;
		const matchingSlas = taskSlas.filter(sla => referenceId(sla.task) === taskId);
		const slaSummary = matchingSlas.map(sla => {
			if (displayValue(sla.has_breached) === 'true') return 'Breached';
			return displayValue(sla.stage) || displayValue(sla.sla) || 'Active SLA';
		}).filter(Boolean).join(', ') || 'No active SLA';
		return {
			number: displayValue(record.number) || displayValue(record.request_number) || sysId,
			priority: displayValue(record.priority) || '—',
			state: displayValue(record.state) || displayValue(record.stage) || '—',
			assignedTo: displayValue(record.assigned_to) || 'Unassigned',
			sla: slaSummary,
			summary: displayValue(record.short_description) || displayValue(record.cat_item) || displayValue(record.description) || type
		};
	});
	const toneForPriority = label => label.includes('1 -') || label.includes('2 -') ? 'orange' : label.includes('3 -') ? 'purple' : 'cyan';
	const toneForState = label => /progress|open/i.test(label) ? 'green' : /breach|overdue/i.test(label) ? 'red' : 'purple';
	const myIncidents = normalize(properties.myIncidents, 'Incident');
	const myCatalogTasks = normalize(properties.myCatalogTasks, 'Catalog task');
	const teamUnassignedIncidents = normalize(properties.teamUnassignedIncidents, 'Incident');
	const teamAssignedIncidents = normalize(properties.teamAssignedIncidents, 'Incident');
	const teamUnassignedCatalogTasks = normalize(properties.teamUnassignedCatalogTasks, 'Catalog task');
	const teamAssignedCatalogTasks = normalize(properties.teamAssignedCatalogTasks, 'Catalog task');
	const teamApprovalRequests = normalize(properties.teamApprovalRequests, 'Approval request');

	return {
		'Your work': [
			{id: 'my-incidents', title: 'Incidents assigned to you', count: myIncidents.length, summary: 'Your incidents, grouped by state and SLA.', breakdown: groupTickets(myIncidents, ticket => ticket.state, toneForState)},
			{id: 'my-catalog-tasks', title: 'Catalog tasks assigned to you', count: myCatalogTasks.length, summary: 'Your catalog tasks, grouped by state and SLA.', breakdown: groupTickets(myCatalogTasks, ticket => ticket.state, toneForState)}
		],
		"Your team's work": [
			{id: 'unassigned-incidents', title: 'Unassigned incidents', count: teamUnassignedIncidents.length, summary: 'Unassigned incidents grouped by priority and SLA.', breakdown: groupTickets(teamUnassignedIncidents, ticket => ticket.priority, toneForPriority)},
			{id: 'assigned-incidents-team', title: 'Incidents assigned to your team', count: teamAssignedIncidents.length, summary: 'Team incidents grouped by assignee and SLA.', breakdown: groupTickets(teamAssignedIncidents, ticket => ticket.assignedTo, () => 'purple')},
			{id: 'unassigned-catalog-tasks', title: 'Unassigned catalog tasks', count: teamUnassignedCatalogTasks.length, summary: 'Unassigned catalog tasks grouped by request and SLA.', breakdown: groupTickets(teamUnassignedCatalogTasks, ticket => ticket.summary, () => 'cyan')},
			{id: 'assigned-catalog-team', title: 'Catalog tasks assigned to your team', count: teamAssignedCatalogTasks.length, summary: 'Team catalog tasks grouped by assignee and SLA.', breakdown: groupTickets(teamAssignedCatalogTasks, ticket => ticket.assignedTo, () => 'green')},
			{id: 'approval-requests', title: 'Request waiting for your approval', count: teamApprovalRequests.length, summary: 'Approval requests grouped by state and SLA.', breakdown: groupTickets(teamApprovalRequests, ticket => ticket.state, () => 'orange')}
		]
	};
};

const view = (state, {updateState, dispatch}) => {
	const sectionsByView = createSections({...state.properties, ...state.liveData});
	const selectedWorkView = Object.prototype.hasOwnProperty.call(sectionsByView, state.workView)
		? state.workView
		: 'Your work';
	const sections = sectionsByView[selectedWorkView];
	const activeIndex = sections.findIndex(section => section.id === state.activeSection);
	const section = sections[activeIndex] || sections[0];
	const nextIndex = (activeIndex + 1) % sections.length;
	const previousIndex = (activeIndex + sections.length - 1) % sections.length;
	const detailBreakdown = section.breakdown.find(item => item.label === state.detailBreakdown);
	const tickets = state.detailBreakdown
		? (detailBreakdown ? detailBreakdown.tickets : [])
		: section.breakdown.flatMap(item => item.tickets || []);
	const detailCount = state.detailBreakdown ? detailBreakdown?.count ?? null : section.count;
	const openTicketList = breakdown => {
		const label = breakdown ? breakdown.label : null;
		const count = breakdown ? breakdown.count : section.count;

		updateState({
			viewMode: 'tickets',
			detailBreakdown: label,
			ticketLayout: 'grid'
		});
		dispatch('VIEW_TICKETS', {
			sectionId: section.id,
			breakdown: label,
			count
		});
	};

	if (state.viewMode === 'tickets') {
		const detailTitle = state.detailBreakdown
			? `${section.title} · ${state.detailBreakdown}`
			: section.title;

		return (
			<section className="sow-overview sow-overview--tickets" aria-label="Ticket list preview">
				<header className="sow-overview__ticket-header">
					<button type="button" className="sow-overview__back" on-click={() => updateState({viewMode: 'overview', detailBreakdown: null})}>
						<span aria-hidden="true">←</span> Overview
					</button>
					<div className="sow-overview__ticket-title">
						<h1>{detailTitle}</h1>
						<p>{detailCount} tickets</p>
					</div>
					<div className="sow-overview__ticket-tools">
						<button type="button" aria-label="Grid view" aria-pressed={state.ticketLayout === 'grid'} on-click={() => updateState({ticketLayout: 'grid'})}>▦</button>
						<button type="button" aria-label="List view" aria-pressed={state.ticketLayout === 'list'} on-click={() => updateState({ticketLayout: 'list'})}>☷</button>
					</div>
				</header>
				<div className={state.ticketLayout === 'list' ? 'sow-overview__ticket-list' : 'sow-overview__ticket-grid'}>
					{tickets.map(ticket => (
						<article className="sow-overview__ticket" key={ticket.number}>
							<div className="sow-overview__ticket-meta">
								<span className="sow-overview__ticket-priority">{ticket.priority}</span>
								<span>{ticket.number}</span>
								<button type="button" aria-label={`More options for ${ticket.number}`}>⋮</button>
							</div>
							<p>{ticket.summary}</p>
							<div className="sow-overview__ticket-fields">
								<span><strong>Assigned to</strong> {ticket.assignedTo || 'Not in preview'}</span>
								<span><strong>SLA</strong> {ticket.sla || 'Not in preview'}</span>
							</div>
						</article>
					))}
				</div>
				{tickets.length === 0 && (
					<p className="sow-overview__ticket-empty">No sample ticket details were supplied for this breakdown.</p>
				)}
				<footer className="sow-overview__ticket-footer">Showing {tickets.length} sample records of {detailCount}; live records require a ServiceNow data resource.</footer>
			</section>
		);
	}

	return (
		<section className="sow-overview" aria-label="Service Operations overview preview">
			<p className="cicd-banner">DEPLOYED THROUGH CI/CD</p>
			<header className="sow-overview__header">
				<div>
					<p className="sow-overview__eyebrow">SERVICE OPERATIONS WORKSPACE</p>
					<h1>Overview</h1>
				</div>
				<label className="sow-overview__filter">
					<span>Showing</span>
					<select
						value={selectedWorkView}
						on-change={event => {
							const requestedWorkView = event.target.value;
							const workView = Object.prototype.hasOwnProperty.call(sectionsByView, requestedWorkView)
								? requestedWorkView
								: 'Your work';
							const nextSections = sectionsByView[workView];
							updateState({
								workView,
								activeSection: nextSections[0].id,
								viewMode: 'overview',
								detailBreakdown: null
							});
						}}
					>
						<option value="Your work">Your work</option>
						<option value="Your team's work">Your team's work</option>
					</select>
				</label>
			</header>
			{state.dataLoading && <p className="sow-overview__summary" role="status">Loading live work…</p>}
			{state.dataError && <p className="sow-overview__ticket-empty" role="alert">{state.dataError}</p>}

			<nav className="sow-overview__sections" aria-label="Work categories">
				{sections.map(item => (
					<button
						className={item.id === section.id ? 'sow-overview__section is-active' : 'sow-overview__section'}
						type="button"
						role="tab"
						aria-selected={item.id === section.id}
						key={item.id}
						on-click={() => updateState({activeSection: item.id})}
					>
						<span>{item.title}</span>
						<span className="sow-overview__count">{item.count ?? '—'}</span>
					</button>
				))}
			</nav>

			<div className="sow-overview__queue">
				<div className="sow-overview__queue-heading">
					<div>
						<p className="sow-overview__eyebrow">WORK QUEUE</p>
						<h2>{section.title}</h2>
						<p className="sow-overview__summary">{section.summary}</p>
					</div>
					<div className="sow-overview__queue-actions">
						<span className="sow-overview__total"><strong>{section.count ?? '—'}</strong> items</span>
						<button
							className="sow-overview__view-all"
							type="button"
							on-click={() => {
								openTicketList(null);
								dispatch('VIEW_ALL', {sectionId: section.id, count: section.count});
							}}
						>
							View all <span aria-hidden="true">→</span>
						</button>
					</div>
				</div>

				<div className="sow-overview__table" role="list" aria-label={section.title}>
					<div className="sow-overview__row sow-overview__row--head" role="row">
						<span role="columnheader">Breakdown</span>
						<span role="columnheader">Distribution</span>
						<span role="columnheader">Count</span>
						<span role="columnheader">SLA</span>
					</div>
					{section.breakdown.length ? section.breakdown.map(item => {
						const share = section.count ? Math.round(item.count / section.count * 100) : 0;

						return (
							<button
								className="sow-overview__row sow-overview__breakdown"
								type="button"
								key={item.label}
								aria-label={`Show ${item.count} tickets: ${item.label}`}
								on-click={() => openTicketList(item)}
							>
								<span>{item.label}</span>
								<span className="sow-overview__bar" aria-hidden="true">
									<span className={`sow-overview__bar-fill sow-overview__bar-fill--${item.tone}`} style={{width: `${share}%`}}></span>
								</span>
								<strong>{item.count}</strong>
								<span className="sow-overview__breakdown-sla">{item.sla || 'Not visible'}</span>
							</button>
						);
					}) : (
						<div className="sow-overview__empty" role="row">
							<span role="cell">No values visible in the screenshot</span>
						</div>
					)}
				</div>

				<footer className="sow-overview__footer">
					<span>{section.count === null ? 'Count not visible in source' : `${section.breakdown.length} breakdowns · ${section.count} total`}</span>
					<div className="sow-overview__carousel">
						<button type="button" aria-label="Previous category" on-click={() => updateState({activeSection: sections[previousIndex].id})}>←</button>
						<span>{activeIndex + 1} / {sections.length}</span>
						<button type="button" aria-label="Next category" on-click={() => updateState({activeSection: sections[nextIndex].id})}>→</button>
					</div>
				</footer>
			</div>
		</section>
	);
};

createCustomElement('x-1234-sow-overview-preview', {
	renderer: {type: snabbdom},
	view,
	styles,
	onConnect: (host, {dispatch}) => dispatch('LOAD_OVERVIEW_DATA'),
	properties: {
		myIncidents: {default: [], schema: {type: 'array', items: {type: 'object'}}},
		myCatalogTasks: {default: [], schema: {type: 'array', items: {type: 'object'}}},
		teamUnassignedIncidents: {default: [], schema: {type: 'array', items: {type: 'object'}}},
		teamAssignedIncidents: {default: [], schema: {type: 'array', items: {type: 'object'}}},
		teamUnassignedCatalogTasks: {default: [], schema: {type: 'array', items: {type: 'object'}}},
		teamAssignedCatalogTasks: {default: [], schema: {type: 'array', items: {type: 'object'}}},
		teamApprovalRequests: {default: [], schema: {type: 'array', items: {type: 'object'}}},
		taskSlas: {default: [], schema: {type: 'array', items: {type: 'object'}}}
	},
	initialState: {
		activeSection: 'my-incidents',
		workView: 'Your work',
		viewMode: 'overview',
		ticketLayout: 'grid'
	},
	actionHandlers: {
		LOAD_OVERVIEW_DATA: async ({updateState}) => loadOverviewData({updateState})
	}
});