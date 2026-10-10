// Pieza de regresión para verificar.py: al montarse desborda 3016 px, pide un recurso que da 404,
// mete un botón de 16 px pegado a otro y lanza una excepción. Solo se ve si alguien la monta.
export function mount(el) {
  const ancho = document.createElement('div');
  ancho.style.inlineSize = '3016px';
  ancho.style.blockSize = '4px';
  el.append(ancho);
  const img = new Image();
  img.alt = '';
  img.src = './no-existe-404.png';
  el.append(img);
  const grupo = document.createElement('div');
  for (const t of ['a', 'b']) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = t;
    b.style.cssText = 'inline-size:16px;block-size:16px;min-block-size:0;min-inline-size:0;padding:0;font-size:10px;line-height:1;';
    grupo.append(b);
  }
  el.append(grupo);
  throw new Error('pieza-rota: fallo provocado al montar');
}
