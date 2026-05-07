import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-cloud',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './cloud.component.html',
  styleUrl: './cloud.component.scss',
})
export class CloudComponent {}
