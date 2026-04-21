import "./assets/main.css";
import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import ui from "@nuxt/ui/vue-plugin";
import App from "./App.vue";
import HomeView from "./views/HomeView.vue";
const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: "/",
            component: HomeView,
        },
    ],
});
const app = createApp(App);
app.use(router);
app.use(ui);
app.mount("#app");
