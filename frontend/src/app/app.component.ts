import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';

interface Summary {
  id: number;
  text: string;
  summary: string;
}

@Component({
  selector: 'app-root',
  template: `
    <div class="container">
      <h1>LLM Summary Editor</h1>

      <div *ngFor="let summary of summaries" class="card">
        <h2>Original Text:</h2>
        <p>{{summary.text}}</p>

        <h2>Summary:</h2>
        <textarea
          [(ngModel)]="summary.summary"
          rows="4"
        ></textarea>

        <button (click)="updateSummary(summary.id, summary.summary)">
          Save Changes
        </button>
      </div>

      <div class="pagination">
        <button 
          [disabled]="currentPage === 0"
          (click)="currentPage = currentPage - 1"
        >
          Previous
        </button>
        <button (click)="currentPage = currentPage + 1">
          Next
        </button>
      </div>
    </div>
  `
})
export class AppComponent implements OnInit {
  summaries: Summary[] = [];
  currentPage = 0;
  itemsPerPage = 10;
  apiUrl = environment.apiUrl || 'http://localhost:8000';

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.fetchSummaries();
  }

  fetchSummaries() {
    this.http.get<Summary[]>(
      `${this.apiUrl}/summaries/?skip=${this.currentPage * this.itemsPerPage}&limit=${this.itemsPerPage}`
    ).subscribe({
      next: (data) => this.summaries = data,
      error: (error) => console.error('Error fetching summaries:', error)
    });
  }

  updateSummary(id: number, newSummary: string) {
    this.http.put(`${this.apiUrl}/summaries/${id}`, {
      summary: newSummary
    }).subscribe({
      next: () => this.fetchSummaries(),
      error: (error) => console.error('Error updating summary:', error)
    });
  }
} 