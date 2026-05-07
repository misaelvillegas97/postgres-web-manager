import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-self-hosted',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './self-hosted.component.html',
  styleUrl: './self-hosted.component.scss',
})
export class SelfHostedComponent {}
