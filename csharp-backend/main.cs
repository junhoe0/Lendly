using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.FileProviders; // <-- Add this line
using System.IO;

var builder = WebApplication.CreateBuilder(args);

// 1. Enable CORS so the browser can make cross-origin requests from frontend to backend
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();
app.UseCors();

var frontendPath = Path.Combine(builder.Environment.ContentRootPath, "..", "frontend");
if (Directory.Exists(frontendPath))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(frontendPath),
        RequestPath = ""
    });

    // Fallback to index.html for root GET / requests
    app.MapGet("/", () => Results.File(Path.Combine(frontendPath, "index.html"), "text/html"));
}

// Sample Data Models
var books = new List<Book>
{
    new Book { Id = 1, Title = "The Great Gatsby", Author = "F. Scott Fitzgerald", Genre = "Fiction", Pages = 180, Copies = 3, AvailableCopies = 3 },
    new Book { Id = 2, Title = "1984", Author = "George Orwell", Genre = "Dystopian", Pages = 328, Copies = 2, AvailableCopies = 2 }
};

var loans = new List<LoanRecord>();

// --- REST Endpoints required by main.js ---

// GET /api/books
app.MapGet("/api/books", (string? search, string? genre, bool? available) =>
{
    var result = books.AsEnumerable();

    if (!string.IsNullOrWhiteSpace(search))
    {
        result = result.Where(b => b.Title.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                                  b.Author.Contains(search, StringComparison.OrdinalIgnoreCase));
    }

    if (!string.IsNullOrWhiteSpace(genre) && genre != "all")
    {
        result = result.Where(b => b.Genre.Equals(genre, StringComparison.OrdinalIgnoreCase));
    }

    if (available == true)
    {
        result = result.Where(b => b.AvailableCopies > 0);
    }

    return Results.Ok(result.ToList());
});

// GET /api/loans
app.MapGet("/api/loans", (string? memberId) =>
{
    var filteredLoans = string.IsNullOrWhiteSpace(memberId) 
        ? loans 
        : loans.Where(l => l.MemberId == memberId).ToList();

    return Results.Ok(filteredLoans);
});

// POST /api/loans (Borrow)
app.MapPost("/api/loans", (BorrowRequest req) =>
{
    var book = books.FirstOrDefault(b => b.Id == req.BookId);
    if (book == null || book.AvailableCopies <= 0)
    {
        return Results.BadRequest(new { error = "Book is unavailable." });
    }

    book.AvailableCopies--;
    var newLoan = new LoanRecord
    {
        Id = loans.Count + 1,
        BookId = req.BookId,
        MemberId = req.MemberId ?? "GUEST",
        Due = DateTime.UtcNow.AddDays(req.Days > 0 ? req.Days : 14).ToString("yyyy-MM-dd")
    };
    loans.Add(newLoan);

    return Results.Created($"/api/loans/{newLoan.Id}", newLoan);
});

// POST /api/loans/return (Return)
app.MapPost("/api/loans/return", (ReturnRequest req) =>
{
    var loan = loans.FirstOrDefault(l => (req.LoanId.HasValue && l.Id == req.LoanId.Value) || 
                                          (req.BookId.HasValue && l.BookId == req.BookId.Value));
    
    if (loan != null)
    {
        loans.Remove(loan);
        var book = books.FirstOrDefault(b => b.Id == loan.BookId);
        if (book != null) book.AvailableCopies++;
    }

    return Results.Ok(new { message = "Book returned successfully." });
});

// PUT /api/account
app.MapPut("/api/account", (AccountDto account) =>
{
    return Results.Ok(account);
});

// Configure default listening URL
app.Run("http://localhost:5000");

// --- Data Contracts ---
record Book
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string Author { get; set; } = "";
    public string Genre { get; set; } = "";
    public int Pages { get; set; }
    public int Copies { get; set; }
    public int AvailableCopies { get; set; }
}

record LoanRecord
{
    public int Id { get; set; }
    public int BookId { get; set; }
    public string MemberId { get; set; } = "";
    public string Due { get; set; } = "";
}

record BorrowRequest(int BookId, string? MemberId, int Days);
record ReturnRequest(int? LoanId, int? BookId, string? MemberId);
record AccountDto(string Name, string MemberId, int LoanLength);