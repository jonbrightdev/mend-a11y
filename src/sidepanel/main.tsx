import { render } from 'preact';
import { App } from './App';
import '../styles/a11y.css';
import '../styles/panel.css';

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
