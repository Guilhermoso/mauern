export interface MenuActions {
  saveNow(): void;
  exportSave(): void;
  importSave(): void;
  newCity(): void;
  setEdgePan(on: boolean): void;
  getEdgePan(): boolean;
  getInfo(): string;
  onClose(): void;
}

// Menu do jogo (Esc). "Nova Cidade" exige confirmação dupla, pois apaga a partida.
export class Menu {
  readonly el = document.createElement('div');
  private confirmStep = 0;

  constructor(private actions: MenuActions) {
    this.el.className = 'modal-backdrop hidden';
    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.el.classList.contains('hidden');
  }

  open(): void {
    this.confirmStep = 0;
    this.render();
    this.el.classList.remove('hidden');
  }

  close(): void {
    this.el.classList.add('hidden');
    this.actions.onClose();
  }

  private render(): void {
    const a = this.actions;
    this.el.innerHTML = '';
    const modal = document.createElement('div');
    modal.className = 'modal panel';
    const title = document.createElement('h2');
    title.textContent = 'MAUERN';
    modal.appendChild(title);

    const info = document.createElement('div');
    info.className = 'info';
    info.textContent = a.getInfo();
    modal.appendChild(info);

    modal.appendChild(button('Salvar agora', () => a.saveNow()));
    modal.appendChild(button('Exportar save (.json)', () => a.exportSave()));
    modal.appendChild(button('Importar save (.json)', () => a.importSave()));

    const row = document.createElement('label');
    row.className = 'row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = a.getEdgePan();
    cb.onchange = () => a.setEdgePan(cb.checked);
    row.append(cb, document.createTextNode('Mover a câmera com o mouse na borda da tela'));
    modal.appendChild(row);

    const labels = ['Nova Cidade', 'Tem certeza? A cidade atual será perdida.', 'Clique de novo para APAGAR tudo'];
    const nc = button(labels[this.confirmStep], () => {
      if (this.confirmStep < 2) {
        this.confirmStep++;
        nc.textContent = labels[this.confirmStep];
      } else {
        a.newCity();
      }
    });
    nc.classList.add('danger');
    modal.appendChild(nc);

    modal.appendChild(button('Voltar ao jogo', () => this.close()));
    this.el.appendChild(modal);
  }
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.onclick = onClick;
  return b;
}
