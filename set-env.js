const fs = require('fs');

const targetPath = './src/environments/environment.ts';

// En desarrollo local, este script intentará leer las variables de entorno, 
// pero si no existen, dejará las credenciales vacías (ya que localmente se debería usar environment.example.ts).
// En Vercel, estas variables DEBEN configurarse en el dashboard.
const envConfigFile = `export const environment = {
  production: true,
  supabaseUrl: '${process.env.SUPABASE_URL || ''}',
  supabaseKey: '${process.env.SUPABASE_ANON_KEY || ''}'
};
`;

console.log('The file `environment.ts` will be written with the following content: \n');
console.log(envConfigFile);

fs.mkdirSync('./src/environments', { recursive: true });
fs.writeFileSync(targetPath, envConfigFile);

console.log(`Output generated at ${targetPath}`);
