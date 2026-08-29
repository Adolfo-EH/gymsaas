# Turky's Gym SaaS

Plataforma de gestión completa para gimnasios, con panel de punto de venta (POS), membresías, pases diarios y dashboard de métricas.

## Setup Inicial (Supabase)

Este proyecto usa Supabase como backend. Por razones de seguridad, las credenciales no se incluyen en el repositorio.

1. Duplica el archivo `src/environments/environment.example.ts` y renómbralo a `environment.ts`.
2. Ingresa tus credenciales en el nuevo archivo:
```typescript
export const environment = {
  production: false,
  supabaseUrl: 'TU_SUPABASE_URL',
  supabaseKey: 'TU_SUPABASE_ANON_KEY',
};
```
3. Coloca el nombre de tu gimnasio.
3. (Opcional) Haz lo mismo para `environment.prod.ts` si planeas construir para producción.

> **Nota:** Asegúrate de que las reglas RLS (Row Level Security) estén correctamente configuradas en tu dashboard de Supabase para proteger tus tablas.
## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
