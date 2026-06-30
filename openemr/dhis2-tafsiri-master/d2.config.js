/** @type {import('@dhis2/cli-app-scripts').D2Config} */
const config = {
    name: 'TAFSIRI',
    description: 'Transformational AI For SQL Inferences and Reporting Integration',
    type: 'app',

    entryPoints: {
        app: './src/App.tsx',
    },

    viteConfigExtensions: './viteConfigExtensions.mts',
}

module.exports = config
