import { registrar } from '../isla.js';
import { feedback } from '../feedback.js';
import { prefs } from '../preferencias.js';

registrar('ejemplo', () => import('./pieza-ejemplo.js'));

const $ = (s) => document.querySelector(s);
const TEMAS = ['system', 'light', 'dark'];
const NOMBRE = { system: 'sistema', light: 'claro', dark: 'oscuro' };
const pintar = () => {
  const p = prefs.get();
  $('#tema').textContent = `Tema: ${NOMBRE[p.theme] ?? 'sistema'}`;
  $('#sonido').setAttribute('aria-pressed', String(p.sound === true));
};
pintar();
$('#tema').addEventListener('click', () => {
  const p = prefs.get();
  prefs.set({ theme: TEMAS[(TEMAS.indexOf(p.theme) + 1) % TEMAS.length] });
  pintar();
});
$('#sonido').addEventListener('click', () => { prefs.set({ sound: !prefs.get().sound }); pintar(); feedback('select', { el: $('#sonido') }); });
$('#guardar').addEventListener('pointerdown', (e) => feedback('success', { el: e.currentTarget, mensaje: 'Cambios guardados.' }));
$('#fallar').addEventListener('pointerdown', (e) => feedback('error', { el: e.currentTarget, mensaje: 'No se ha podido guardar: falta conexión. Vuelve a intentarlo.' }));
$('#formulario').addEventListener('submit', (e) => {
  e.preventDefault();
  const c = $('#correo');
  if (!c.checkValidity()) { c.setAttribute('aria-invalid', 'true'); c.focus(); feedback('error', { el: c, mensaje: 'Escribe un correo con arroba, por ejemplo nombre@dominio.es.' }); }
  else { c.removeAttribute('aria-invalid'); feedback('success', { el: c, mensaje: 'Correo guardado.' }); }
});
