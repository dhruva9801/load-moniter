import { Routes } from '@angular/router';
import { LandingComponent } from './features/landing/landing';
import { HomeComponent } from './features/dashboard/home/home';
import { LiveComponent } from './features/live/live';

export const routes: Routes = [
  { path: '',      component: LandingComponent },
  { path: 'train', component: HomeComponent },
  { path: 'live',  component: LiveComponent }
];