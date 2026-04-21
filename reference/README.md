# Referencias externas (submódulos)

## 1. `awesome-design-md` — diseño para agentes (lo del artículo)

**Repositorio:** https://github.com/VoltAgent/awesome-design-md  

Es la colección de “DESIGN.md” inspirada en marcas (Apple, Spotify, IBM, etc.) pensada para que **agentes de código** lean un solo spec de aspecto y generen UI coherente. Las estrellas del proyecto rondan las decenas de miles y sigue activo.

### Cómo usarlo (flujo recomendado)

1. **Elige una marca** en el README del submódulo: `reference/awesome-design-md/README.md` o la web del proyecto.
2. **Obtén el DESIGN.md completo** desde el catálogo oficial (el contenido detallado suele estar en **getdesign.md**, p. ej. `https://getdesign.md/spotify/design-md`). Las carpetas `design-md/<marca>/README.md` del clon pueden ser solo un enlace a esa URL.
3. **Copia el spec al frontend** donde trabajas, por ejemplo:
   - `frontend-v2/DESIGN.md`
4. En Cursor (o el agente que uses), indica que **tome `DESIGN.md` como referencia visual** al implementar pantallas o componentes, sin contradecir tokens que ya tengáis (Tailwind, shadcn, etc.).

No hay “paquete npm”: es documentación pensada para el agente.

### Clonar este repo con submódulos

```bash
git submodule update --init --recursive
```

### Actualizar el submódulo a la última `main`

```bash
git submodule update --remote reference/awesome-design-md
```

---

## 2. `awesome-design-systems` — lista de enlaces (otro repo)

**Repositorio:** https://github.com/alexpate/awesome-design-systems  

Es una **lista curada** de enlaces a design systems reales (no DESIGN.md ni un solo archivo). Sirve como índice de inspiración; **no es el mismo proyecto** que el artículo de “Awesome Design / DESIGN.md”.

### Actualizar

```bash
git submodule update --remote reference/awesome-design-systems
```
