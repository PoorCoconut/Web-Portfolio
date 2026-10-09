using System;

namespace MyWebPortfolio.Models
{
    public class Visitor
    {
        public int Id { get; set; }
        public string DisplayName { get; set; } = string.Empty;

        public bool Authenticate()
        {
            throw new NotImplementedException();
        }
    }
}
