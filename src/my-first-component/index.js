import {createCustomElement} from '@servicenow/ui-core';
import snabbdom from '@servicenow/ui-renderer-snabbdom';
import styles from './styles.scss';

const getDisplayValue = value => {
	if (value === null || value === undefined || value === '') return 'Not set';
	if (typeof value === 'object') {
		return value.display_value || value.displayValue || value.value || 'Not set';
	}

	return value;
};

const view = (state, {updateState, dispatch}) => {
	const incidents = Array.isArray(state.properties.incidents) ? state.properties.incidents : [];

	return (
			<section className="incident-list" aria-label="Incidents">
				<p className="cicd-banner">DEPLOYED THROUGH CI/CD</p>
				<header className="incident-list__header">
					<h2 className="incident-list__title">Incidents</h2>
					<span className="incident-list__count">{incidents.length} records</span>
				</header>
				<div className="incident-list__scroll">
					<table className="incident-list__table">
						<thead>
							<tr>
								<th scope="col">Number</th>
								<th scope="col">Short description</th>
								<th scope="col">Caller</th>
								<th scope="col">Priority</th>
								<th scope="col">State</th>
								<th scope="col">Assigned to</th>
							</tr>
						</thead>
						<tbody>
							{incidents.length === 0 ? (
								<tr>
									<td className="incident-list__empty" colSpan="6">
										No incident records received
									</td>
								</tr>
							) : incidents.map((incident, index) => {
								const sysId = getDisplayValue(incident.sys_id);
								const rowClass = state.selectedIncident === sysId
									? 'incident-list__row incident-list__row--selected'
									: 'incident-list__row';

								return (
									<tr className={rowClass} key={incident.sys_id || incident.number || index}>
										<td>
											<button
												type="button"
												className="incident-list__record-link"
												on-click={() => dispatch('SELECT_INCIDENT', {
													sysId,
													number: getDisplayValue(incident.number)
												})}
											>
												{getDisplayValue(incident.number)}
											</button>
										</td>
										<td>{getDisplayValue(incident.short_description)}</td>
										<td>{getDisplayValue(incident.caller_id)}</td>
										<td>{getDisplayValue(incident.priority)}</td>
										<td>{getDisplayValue(incident.state)}</td>
										<td>{getDisplayValue(incident.assigned_to)}</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
		</section>
	);
};

createCustomElement('x-1234-my-first-component', {
	renderer: {type: snabbdom},
	view,
	styles,
	properties: {
		incidents: {
			default: [],
			schema: {
				type: 'array',
				items: {type: 'object'}
			}
		}
	},
	initialState: {
		selectedIncident: null
	},
	actionHandlers: {
		SELECT_INCIDENT: ({action, updateState, dispatch}) => {
			const {sysId, number} = action.payload;

			updateState({selectedIncident: sysId});
			dispatch('INCIDENT_OPENED', {
				sysId,
				number
			});
		}
	}
});
