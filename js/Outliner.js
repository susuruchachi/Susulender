// js/ui/Outliner.js
// A flat list of every object in the scene: click to select (shift-click
// to add/remove from selection), an eye icon to toggle visibility.

export class Outliner {
  constructor(app, container) {
    this.app = app;
    this.container = container;
    this.render();
  }

  render() {
    this.container.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.textContent = 'Outliner';
    this.container.appendChild(header);

    const list = document.createElement('div');
    list.className = 'outliner-list';

    this.app.scene.objects.forEach((o) => {
      const row = document.createElement('div');
      row.className = 'outliner-row' + (o.selected ? ' selected' : '') + (o.id === this.app.scene.activeObjectId ? ' active' : '');

      const nameEl = document.createElement('span');
      nameEl.className = 'outliner-name';
      nameEl.textContent = o.name;
      row.appendChild(nameEl);

      const visBtn = document.createElement('button');
      visBtn.className = 'outliner-vis-btn';
      visBtn.textContent = o.visible ? 'Vis' : 'Hid';
      visBtn.title = 'Toggle visibility';
      visBtn.onclick = (e) => {
        e.stopPropagation();
        o.visible = !o.visible;
        this.app.viewport.syncObjects(this.app.scene);
        this.render();
      };
      row.appendChild(visBtn);

      row.onclick = (e) => {
        this.app.scene.toggleSelectObject(o.id, e.shiftKey);
        this.app.onSelectionChanged();
      };
      list.appendChild(row);
    });

    if (!this.app.scene.objects.length) {
      const empty = document.createElement('div');
      empty.className = 'panel-empty';
      empty.textContent = 'No objects yet \u2014 use Add to create one.';
      list.appendChild(empty);
    }

    this.container.appendChild(list);
  }
}
