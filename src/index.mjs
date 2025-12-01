import { createApp } from 'vue';
import { createVuetify } from 'vuetify'
import App from './app.vue';

//import 'vuetify/dist/vuetify.min.css'

createApp(App)
    .use(createVuetify())
    .mount('#app')