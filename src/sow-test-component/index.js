import {createCustomElement} from '@servicenow/ui-core';
import snabbdom from '@servicenow/ui-renderer-snabbdom';

const view = () => (
	<section className="sow-code-test">
		<h2>SOW code component is working</h2>
		<p>This content is rendered by a custom component from the project source.</p>
	</section>
);

createCustomElement('x-1234-sow-test-component', {
	renderer: {type: snabbdom},
	view
});