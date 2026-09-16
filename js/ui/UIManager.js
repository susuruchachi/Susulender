// js/ui/UIManager.js
// Builds the whole DOM skeleton (menu bar, toolbar, viewport slot,
// sidebar with tabs, status bar) and owns the panel instances. Below
// ~900px wide the sidebar becomes a slide-up drawer switched by tab
// buttons, so the 3D view stays usable on a phone or small tablet.

import { MenuBar } from './MenuBar.js';
import { Toolbar } from './Toolbar.js';
import { Outliner } from './Outliner.js';
import { PropertiesPanel } from './PropertiesPanel.js';
import { ModifierPanel } from './ModifierPanel.js';
import { UVEditor } from '../uv/UVEditor.js';

export class UIManager {
  constructor(app, rootEl) {
    this.app = app;
    this.root = rootEl;
    this._buildSkeleton();

    this.menuBar = new MenuBar(app, this.els.menubar);
    this.toolbar = new Toolbar(app, this.els.toolbar);
    this.outliner = new Outliner(app, this.els.panelOutliner);
    this.properties = new PropertiesPanel(app, this.els.panelProperties);
    this.modifiers = new ModifierPanel(app, this.els.panelModifiers);
    this.uvEditor = new UVEditor(app, this.els.panelUV);

    this._activeTab = 'outliner';
    this._setTab(this._activeTab);
  }

  // Called once by App after viewport/gizmo exist - the DOM skeleton
  // (built in the constructor) doesn't need them, but this floating
  // control does.
  attachRuntimeHooks() {
    this._buildModalOverlay();
  }

  get viewportContainer() {
    return this.els.viewport;
  }

  _buildSkeleton() {
    this.root.innerHTML = '';
    this.root.className = 'bs-root';

    const menubar = document.createElement('div');
    menubar.className = 'bs-menubar';
    const mainRow = document.createElement('div');
    mainRow.className = 'bs-main-row';
    const toolbar = document.createElement('div');
    toolbar.className = 'bs-toolbar';
    const viewport = document.createElement('div');
    viewport.className = 'bs-viewport';
    const sidebar = document.createElement('div');
    sidebar.className = 'bs-sidebar';
    const tabs = document.createElement('div');
    tabs.className = 'bs-sidebar-tabs';
    const sidebarContent = document.createElement('div');
    sidebarContent.className = 'bs-sidebar-content';
    const statusbar = document.createElement('div');
    statusbar.className = 'bs-statusbar';

    const panelOutliner = document.createElement('div');
    panelOutliner.className = 'bs-panel';
    const panelProperties = document.createElement('div');
    panelProperties.className = 'bs-panel';
    const panelModifiers = document.createElement('div');
    panelModifiers.className = 'bs-panel';
    const panelUV = document.createElement('div');
    panelUV.className = 'bs-panel bs-panel-uv';

    sidebarContent.append(panelOutliner, panelProperties, panelModifiers, panelUV);

    [
      ['outliner', 'Outliner'],
      ['properties', 'Properties'],
      ['modifiers', 'Modifiers'],
      ['uv', 'UV Editor'],
    ].forEach(([key, label]) => {
      const btn = document.createElement('button');
      btn.className = 'bs-tab-button';
      btn.textContent = label;
      btn.dataset.tab = key;
      btn.onclick = () => this._setTab(key);
      tabs.appendChild(btn);
    });

    sidebar.append(tabs, sidebarContent);
    mainRow.append(toolbar, viewport, sidebar);
    this.root.append(menubar, mainRow, statusbar);

    const drawerHandle = document.createElement('button');
    drawerHandle.className = 'bs-drawer-handle';
    drawerHandle.textContent = 'Panels \u25b4';
    drawerHandle.onclick = () => this.root.classList.toggle('bs-drawer-open');
    sidebar.prepend(drawerHandle);

    this.els = {
      menubar,
      toolbar,
      viewport,
      sidebar,
      tabs,
      statusbar,
      panelOutliner,
      panelProperties,
      panelModifiers,
      panelUV,
    };
  }

  _setTab(key) {
    this._activeTab = key;
    [...this.els.tabs.children].forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === key));
    const map = { outliner: this.els.panelOutliner, properties: this.els.panelProperties, modifiers: this.els.panelModifiers, uv: this.els.panelUV };
    Object.entries(map).forEach(([k, el]) => (el.style.display = k === key ? 'flex' : 'none'));
    if (key === 'uv') this.uvEditor.resize();
  }

  // Small floating control shown only while a keyboard-driven G/R/S modal
  // is active, so touch users without a keyboard can constrain an axis and
  // confirm/cancel the operation.
  _buildModalOverlay() {
    const bar = document.createElement('div');
    bar.className = 'bs-modal-overlay';
    bar.style.display = 'none';
    ['X', 'Y', 'Z'].forEach((axis) => {
      const btn = document.createElement('button');
      btn.className = 'bs-modal-btn';
      btn.textContent = axis;
      btn.onclick = () => this.app.gizmo.setKeyboardAxis(axis);
      bar.appendChild(btn);
    });
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'bs-modal-btn bs-modal-confirm';
    confirmBtn.textContent = '\u2713';
    confirmBtn.onclick = () => this.app.gizmo.confirm();
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'bs-modal-btn bs-modal-cancel';
    cancelBtn.textContent = '\u2715';
    cancelBtn.onclick = () => this.app.gizmo.cancel();
    bar.append(confirmBtn, cancelBtn);
    this.els.viewport.appendChild(bar);
    this._modalBar = bar;

    this.app.viewport.onBeforeRender(() => {
      const active = this.app.gizmo.isModalActive() && this.app.gizmo.confirmOnClick;
      this._modalBar.style.display = active ? 'flex' : 'none';
    });
  }

  showNotification(message, level = 'info') {
    const el = document.createElement('div');
    el.className = 'bs-toast bs-toast-' + level;
    el.textContent = message;
    this.els.statusbar.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 300);
    }, 5000);
  }

  refreshAll() {
    this.menuBar.refresh();
    this.toolbar.render();
    this.outliner.render();
    this.properties.render();
    this.modifiers.render();
    this.uvEditor.render();
  }

  refreshSelection() {
    this.outliner.render();
    this.properties.render();
    this.modifiers.render();
    this.toolbar.render();
    this.uvEditor.render();
  }

  refreshTransformOnly() {
    this.properties.render();
    this.uvEditor.render();
  }

  refreshMode() {
    this.menuBar.refresh();
    this.toolbar.render();
    this.uvEditor.render();
  }
}
