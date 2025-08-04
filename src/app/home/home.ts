import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: false,
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class Home {
  constructor(private router: Router) {}
  ngOnInit():void {
    // Automatically navigate to 'galaxy' when HomeComponent loads
    this.router.navigate(['home/about']);
  }

}
